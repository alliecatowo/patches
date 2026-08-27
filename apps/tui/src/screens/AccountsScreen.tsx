import { present } from '../api/present.js';
import type { Credential } from '../api/wire/types.js';
import { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import type { PatchesApi } from '../api/client.js';
import { describeGrpcError, type FriendlyError } from '../api/errors.js';
import { sshAuthSock } from '../auth/ssh-agent.js';
import {
  discoverEnrollmentCandidates,
  enrollSshCredential,
  type EnrollmentCandidate,
} from '../auth/ssh-enroll.js';
import type { ActiveSession } from '../auth/session.js';
import { theme } from '../theme/index.js';
import {
  CREDENTIAL_TYPE_SCHEMA,
  GITHUB_LOGIN_STATUS,
  OIDC_LOGIN_STATUS,
  enumWireName,
} from '../api/wire/enums.js';
import { enrollmentOffered } from './DevicesScreen.js';

export interface AccountsScreenProps {
  api: PatchesApi;
  env: NodeJS.ProcessEnv;
  session: ActiveSession;
  isActive: boolean;
  ensureAccessToken: () => Promise<string>;
  /**
   * B-107: this machine's enrolled messaging-device id, when one is bound. Shows as a
   * status line with the `:devices` affordance; enrollment hides while it exists.
   */
  e2eeEnrolledDeviceId?: string | undefined;
  /** This node's `GetE2eeCapability` state — gates the encrypted-device entry point. */
  e2eeCapabilityState?: number | undefined;
  /** Pushes the `:devices` screen (where the roster and revocation live). */
  onOpenDevices?: (() => void) | undefined;
  /** B-107: runs device enrollment through the shell's vault-backed sender. */
  onEnrollE2ee?:
    | (() => Promise<{
        ok: boolean;
        copy: string;
        peerWarning?: string | undefined;
        needsAuthority?: boolean | undefined;
      }>)
    | undefined;
  /** ADR 0037 §2: fires instead of an error message when `onEnrollE2ee` finds a
   * published root this device cannot reach — the shell navigates to the link/rotate
   * chooser (`LinkThisDeviceScreen`) rather than this screen rendering a dead end. */
  onNeedsAuthority?: (() => void) | undefined;
  onLogout: () => void;
  onResendVerification: () => void;
  onBack: () => void;
}

type CredentialsState =
  | { status: 'loading' }
  | { status: 'ready'; credentials: Credential[] }
  | { status: 'error'; error: FriendlyError };

type OidcProvider = { id: string; displayName: string };

type AddFlow =
  | { status: 'idle' }
  | { status: 'choosing_type'; hasGitHub: boolean; oidcProviders: OidcProvider[] }
  | { status: 'discovering' }
  | { status: 'picking'; candidates: EnrollmentCandidate[]; selected: number }
  | { status: 'enrolling' }
  | {
      status: 'github_device';
      verificationUri: string;
      userCode: string;
      deviceCode: string;
      interval: number;
    }
  | {
      status: 'github_polling';
      verificationUri: string;
      userCode: string;
      deviceCode: string;
      interval: number;
    }
  | { status: 'oidc_pick_provider'; providers: OidcProvider[]; selected: number }
  | {
      status: 'oidc_device';
      providerId: string;
      verificationUri: string;
      userCode: string;
      deviceCode: string;
      interval: number;
    }
  | {
      status: 'oidc_polling';
      providerId: string;
      verificationUri: string;
      userCode: string;
      deviceCode: string;
      interval: number;
    }
  | { status: 'done'; message: string }
  | { status: 'error'; message: string };

type RevokeFlow =
  | { status: 'idle' }
  | { status: 'confirming'; credential: Credential }
  | { status: 'revoking'; credential: Credential }
  | { status: 'done'; message: string }
  | { status: 'error'; message: string };

/** B-107 states for the encrypted-device entry point on this screen. */
type E2eeFlow =
  | { status: 'idle' }
  | { status: 'confirming' }
  | { status: 'running' }
  | { status: 'done'; message: string; peerWarning?: string | undefined }
  | { status: 'error'; message: string };

function describeCandidate(candidate: EnrollmentCandidate): string {
  const where = candidate.knownAt.length === 0 ? '' : ` (${candidate.knownAt.join(', ')})`;
  return `${candidate.fingerprint}  ${candidate.algorithm}${where}`;
}

function describeCredentialRow(credential: Credential): string {
  const label = credential.label === '' ? '(no label)' : credential.label;
  const identifier = credential.identifier === '' ? '' : `  ${credential.identifier}`;
  return `${enumWireName(CREDENTIAL_TYPE_SCHEMA, credential.type)}  ${label}${identifier}`;
}

export function AccountsScreen({
  api,
  env,
  session,
  isActive,
  ensureAccessToken,
  e2eeEnrolledDeviceId,
  e2eeCapabilityState,
  onOpenDevices,
  onEnrollE2ee,
  onNeedsAuthority,
  onLogout,
  onResendVerification,
  onBack,
}: AccountsScreenProps): ReactElement {
  const [state, setState] = useState<CredentialsState>({ status: 'loading' });
  const [addFlow, setAddFlow] = useState<AddFlow>({ status: 'idle' });
  const [revokeFlow, setRevokeFlow] = useState<RevokeFlow>({ status: 'idle' });
  const [e2eeFlow, setE2eeFlow] = useState<E2eeFlow>({ status: 'idle' });
  const [selectedCredential, setSelectedCredential] = useState(0);

  /** B-107: enrollment entry offered only where the node accepts it, and only when this
   * machine has no enrolled device yet (`:devices` owns re-issue and revocation). */
  const e2eeEnrollAvailable =
    onEnrollE2ee !== undefined &&
    e2eeEnrolledDeviceId === undefined &&
    enrollmentOffered(e2eeCapabilityState);

  async function runE2eeEnrollment(): Promise<void> {
    if (onEnrollE2ee === undefined) return;
    setE2eeFlow({ status: 'running' });
    const outcome = await onEnrollE2ee();
    if (outcome.needsAuthority === true) {
      setE2eeFlow({ status: 'idle' });
      onNeedsAuthority?.();
      return;
    }
    if (outcome.ok) {
      setE2eeFlow({
        status: 'done',
        message: outcome.copy,
        ...(outcome.peerWarning === undefined ? {} : { peerWarning: outcome.peerWarning }),
      });
      return;
    }
    setE2eeFlow({ status: 'error', message: outcome.copy });
  }

  useEffect(() => {
    let cancelled = false;
    ensureAccessToken()
      .then((accessToken) => api.listCredentials(accessToken))
      .then((response) => {
        if (!cancelled) setState({ status: 'ready', credentials: [...response.credentials] });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ status: 'error', error: describeGrpcError(error, api.target) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api, ensureAccessToken]);

  // Poll GitHub device flow
  useEffect(() => {
    if (addFlow.status !== 'github_polling') return;
    const { deviceCode, interval } = addFlow;
    let cancelled = false;
    const timerId = setInterval(
      () => {
        ensureAccessToken()
          .then((token) => api.pollGitHubLogin({ deviceCode }, token))
          .then((response) => {
            if (cancelled) return;
            const s = response.status;
            if (s === GITHUB_LOGIN_STATUS.PENDING || s === GITHUB_LOGIN_STATUS.SLOW_DOWN) return;
            clearInterval(timerId);
            if (s === GITHUB_LOGIN_STATUS.COMPLETE) {
              setAddFlow({ status: 'done', message: 'GitHub account linked.' });
            } else {
              setAddFlow({
                status: 'error',
                message: 'GitHub authorisation expired — press Esc to try again.',
              });
            }
            void ensureAccessToken()
              .then((t) => api.listCredentials(t))
              .then((r) => {
                if (!cancelled) setState({ status: 'ready', credentials: [...r.credentials] });
              });
          })
          .catch((error: unknown) => {
            if (cancelled) return;
            clearInterval(timerId);
            setAddFlow({
              status: 'error',
              message: error instanceof Error ? error.message : 'Poll error.',
            });
          });
      },
      Math.max(5, interval) * 1000,
    );
    return () => {
      cancelled = true;
      clearInterval(timerId);
    };
  }, [addFlow, api, ensureAccessToken]);

  // Poll OIDC device flow
  useEffect(() => {
    if (addFlow.status !== 'oidc_polling') return;
    const { providerId, deviceCode, interval } = addFlow;
    let cancelled = false;
    const timerId = setInterval(
      () => {
        ensureAccessToken()
          .then((token) => api.pollOidcLogin({ provider: providerId, deviceCode }, token))
          .then((response) => {
            if (cancelled) return;
            const s = response.status;
            if (s === OIDC_LOGIN_STATUS.PENDING || s === OIDC_LOGIN_STATUS.SLOW_DOWN) return;
            clearInterval(timerId);
            if (s === OIDC_LOGIN_STATUS.COMPLETE) {
              setAddFlow({ status: 'done', message: 'OIDC account linked.' });
            } else {
              setAddFlow({
                status: 'error',
                message: 'OIDC authorisation expired — press Esc to try again.',
              });
            }
            void ensureAccessToken()
              .then((t) => api.listCredentials(t))
              .then((r) => {
                if (!cancelled) setState({ status: 'ready', credentials: [...r.credentials] });
              });
          })
          .catch((error: unknown) => {
            if (cancelled) return;
            clearInterval(timerId);
            setAddFlow({
              status: 'error',
              message: error instanceof Error ? error.message : 'Poll error.',
            });
          });
      },
      Math.max(5, interval) * 1000,
    );
    return () => {
      cancelled = true;
      clearInterval(timerId);
    };
  }, [addFlow, api, ensureAccessToken]);

  async function beginAdd(): Promise<void> {
    let hasGitHub = false;
    let oidcProviders: OidcProvider[] = [];
    try {
      const policy = await api.getAuthPolicy();
      hasGitHub = policy.githubAuth === true;
      oidcProviders = (policy.oidcProviders ?? []).map((p) => ({
        id: p.id,
        displayName: p.displayName,
      }));
    } catch {
      // Policy fetch failure → SSH only
    }
    // SSH is the only credential type this node offers → skip the picker so `a`
    // keeps its pre-GitHub meaning: go straight to agent discovery.
    if (!hasGitHub && oidcProviders.length === 0) {
      await beginSshAdd();
      return;
    }
    setAddFlow({ status: 'choosing_type', hasGitHub, oidcProviders });
  }

  async function beginSshAdd(): Promise<void> {
    const socketPath = sshAuthSock(env);
    if (socketPath === undefined) {
      setAddFlow({
        status: 'error',
        message: 'No SSH agent is running (SSH_AUTH_SOCK is not set).',
      });
      return;
    }
    setAddFlow({ status: 'discovering' });
    try {
      const candidates = await discoverEnrollmentCandidates(socketPath);
      if (candidates.length === 0) {
        setAddFlow({ status: 'error', message: 'The SSH agent has no identities loaded.' });
        return;
      }
      setAddFlow({ status: 'picking', candidates, selected: 0 });
    } catch (error) {
      setAddFlow({
        status: 'error',
        message: error instanceof Error ? error.message : 'Could not reach the SSH agent.',
      });
    }
  }

  async function beginGitHubAdd(): Promise<void> {
    try {
      const token = await ensureAccessToken();
      const response = await api.beginGitHubLogin({}, token);
      setAddFlow({
        status: 'github_device',
        verificationUri: response.verificationUri,
        userCode: response.userCode,
        deviceCode: response.deviceCode,
        interval: response.interval,
      });
    } catch (error) {
      setAddFlow({
        status: 'error',
        message: error instanceof Error ? error.message : 'Could not start GitHub device flow.',
      });
    }
  }

  async function beginOidcAdd(providerId: string): Promise<void> {
    try {
      const token = await ensureAccessToken();
      const response = await api.beginOidcLogin({ provider: providerId }, token);
      setAddFlow({
        status: 'oidc_device',
        providerId,
        verificationUri: response.verificationUri,
        userCode: response.userCode,
        deviceCode: response.deviceCode,
        interval: response.interval,
      });
    } catch (error) {
      setAddFlow({
        status: 'error',
        message: error instanceof Error ? error.message : 'Could not start OIDC device flow.',
      });
    }
  }

  async function confirmAdd(picking: Extract<AddFlow, { status: 'picking' }>): Promise<void> {
    const candidate = picking.candidates[picking.selected];
    const socketPath = sshAuthSock(env);
    if (candidate === undefined || socketPath === undefined) return;
    setAddFlow({ status: 'enrolling' });
    try {
      const accessToken = await ensureAccessToken();
      const { credential } = await enrollSshCredential({
        api,
        accessToken,
        nodeDomain: api.target,
        socketPath,
        identity: candidate,
      });
      setAddFlow({
        status: 'done',
        message: `Enrolled ${present(credential) ? credential.identifier : candidate.fingerprint}.`,
      });
      const refreshed = await ensureAccessToken();
      const response = await api.listCredentials(refreshed);
      setState({ status: 'ready', credentials: [...response.credentials] });
    } catch (error) {
      setAddFlow({
        status: 'error',
        message: error instanceof Error ? error.message : 'Could not enroll that key.',
      });
    }
  }

  async function revoke(credential: Credential): Promise<void> {
    setRevokeFlow({ status: 'revoking', credential });
    try {
      const accessToken = await ensureAccessToken();
      await api.revokeCredential({ id: credential.id }, accessToken);
      setRevokeFlow({ status: 'done', message: `Revoked ${describeCredentialRow(credential)}.` });
      const refreshed = await ensureAccessToken();
      const response = await api.listCredentials(refreshed);
      const credentials = [...response.credentials];
      setState({ status: 'ready', credentials });
      setSelectedCredential((index) => Math.min(index, Math.max(credentials.length - 1, 0)));
    } catch (error) {
      setRevokeFlow({ status: 'error', message: describeGrpcError(error, api.target).title });
    }
  }

  useInput(
    (input, key) => {
      if (key.escape) {
        if (
          revokeFlow.status === 'confirming' ||
          revokeFlow.status === 'done' ||
          revokeFlow.status === 'error'
        ) {
          setRevokeFlow({ status: 'idle' });
          return;
        }
        if (
          e2eeFlow.status === 'confirming' ||
          e2eeFlow.status === 'done' ||
          e2eeFlow.status === 'error'
        ) {
          setE2eeFlow({ status: 'idle' });
          return;
        }
        if (addFlow.status !== 'idle') {
          setAddFlow({ status: 'idle' });
          return;
        }
        onBack();
        return;
      }
      if (revokeFlow.status === 'confirming') {
        if (input === 'y' || key.return) void revoke(revokeFlow.credential);
        else if (input === 'n') setRevokeFlow({ status: 'idle' });
        return;
      }
      if (revokeFlow.status === 'revoking') return;
      if (revokeFlow.status === 'done' || revokeFlow.status === 'error') {
        setRevokeFlow({ status: 'idle' });
        return;
      }

      if (e2eeFlow.status === 'confirming') {
        if (input === 'y' || key.return) void runE2eeEnrollment();
        else if (input === 'n') setE2eeFlow({ status: 'idle' });
        return;
      }
      if (e2eeFlow.status === 'running') return;
      if (e2eeFlow.status === 'done' || e2eeFlow.status === 'error') {
        setE2eeFlow({ status: 'idle' });
        return;
      }

      if (addFlow.status === 'choosing_type') {
        if (input === 's') void beginSshAdd();
        else if (input === 'g' && addFlow.hasGitHub) void beginGitHubAdd();
        else if (input === 'o' && addFlow.oidcProviders.length > 0) {
          if (addFlow.oidcProviders.length === 1 && addFlow.oidcProviders[0] !== undefined) {
            void beginOidcAdd(addFlow.oidcProviders[0].id);
          } else {
            setAddFlow({
              status: 'oidc_pick_provider',
              providers: addFlow.oidcProviders,
              selected: 0,
            });
          }
        }
        return;
      }

      if (addFlow.status === 'oidc_pick_provider') {
        if (input === 'j' || key.downArrow) {
          setAddFlow({
            ...addFlow,
            selected: Math.min(addFlow.selected + 1, addFlow.providers.length - 1),
          });
          return;
        }
        if (input === 'k' || key.upArrow) {
          setAddFlow({ ...addFlow, selected: Math.max(addFlow.selected - 1, 0) });
          return;
        }
        if (key.return) {
          const p = addFlow.providers[addFlow.selected];
          if (p !== undefined) void beginOidcAdd(p.id);
        }
        return;
      }

      if (addFlow.status === 'github_device') {
        if (key.return) setAddFlow({ ...addFlow, status: 'github_polling' });
        return;
      }
      if (addFlow.status === 'github_polling') return;
      if (addFlow.status === 'oidc_device') {
        if (key.return) setAddFlow({ ...addFlow, status: 'oidc_polling' });
        return;
      }
      if (addFlow.status === 'oidc_polling') return;

      if (addFlow.status === 'picking') {
        if (input === 'j' || key.downArrow) {
          setAddFlow({
            ...addFlow,
            selected: Math.min(addFlow.selected + 1, addFlow.candidates.length - 1),
          });
          return;
        }
        if (input === 'k' || key.upArrow) {
          setAddFlow({ ...addFlow, selected: Math.max(addFlow.selected - 1, 0) });
          return;
        }
        if (key.return) void confirmAdd(addFlow);
        return;
      }
      if (addFlow.status === 'discovering' || addFlow.status === 'enrolling') return;
      if (addFlow.status === 'done' || addFlow.status === 'error') {
        setAddFlow({ status: 'idle' });
        return;
      }

      if (state.status === 'ready' && state.credentials.length > 0) {
        if (input === 'j' || key.downArrow) {
          setSelectedCredential((i) => Math.min(i + 1, state.credentials.length - 1));
          return;
        }
        if (input === 'k' || key.upArrow) {
          setSelectedCredential((i) => Math.max(i - 1, 0));
          return;
        }
        if (input === 'v') {
          const c = state.credentials[selectedCredential];
          if (c !== undefined) setRevokeFlow({ status: 'confirming', credential: c });
          return;
        }
      }
      if (input === 'a') {
        void beginAdd();
        return;
      }
      if (input === 'e' && e2eeEnrollAvailable) {
        setE2eeFlow({ status: 'confirming' });
        return;
      }
      if (input === 'D' && onOpenDevices !== undefined) {
        onOpenDevices();
        return;
      }
      if (input === 'r' && !session.emailVerified) {
        onResendVerification();
        return;
      }
      if (input === 'x') onLogout();
    },
    { isActive },
  );

  const oauthFlow =
    addFlow.status === 'github_device' ||
    addFlow.status === 'github_polling' ||
    addFlow.status === 'oidc_device' ||
    addFlow.status === 'oidc_polling'
      ? addFlow
      : undefined;
  const isOauthPolling = addFlow.status === 'github_polling' || addFlow.status === 'oidc_polling';
  const oauthKind = addFlow.status.startsWith('github') ? 'GitHub' : 'OIDC';

  return (
    <Box flexDirection="column">
      <Text color={theme.accent}>Account</Text>
      <Text color={theme.muted}>
        @{session.actor?.handle ?? session.userId} · {session.nodeOrigin}
      </Text>
      {session.emailVerified ? null : (
        <Text color={theme.warn}>
          email unverified — r resend, or run `patches verify &lt;code&gt;`
        </Text>
      )}
      <Box marginTop={1} flexDirection="column">
        {state.status === 'loading' ? <Text color={theme.muted}>Loading credentials…</Text> : null}
        {state.status === 'error' ? <Text color={theme.error}>{state.error.title}</Text> : null}
        {state.status === 'ready' && state.credentials.length === 0 ? (
          <Text color={theme.muted}>No credentials on this account.</Text>
        ) : null}
        {state.status === 'ready'
          ? state.credentials.map((credential, index) => (
              <Text
                key={credential.id}
                color={index === selectedCredential ? theme.accent : theme.muted}
                bold={index === selectedCredential}
              >
                {index === selectedCredential ? '› ' : '  '}
                {describeCredentialRow(credential)}
              </Text>
            ))
          : null}
      </Box>
      {revokeFlow.status === 'confirming' ? (
        <Box marginTop={1}>
          <Text color={theme.warn}>
            Revoke {describeCredentialRow(revokeFlow.credential)}? y confirm · n/Esc cancel
          </Text>
        </Box>
      ) : null}
      {revokeFlow.status === 'revoking' ? <Text color={theme.muted}>Revoking…</Text> : null}
      {revokeFlow.status === 'done' ? <Text color={theme.ok}>{revokeFlow.message}</Text> : null}
      {revokeFlow.status === 'error' ? <Text color={theme.error}>{revokeFlow.message}</Text> : null}
      {addFlow.status === 'choosing_type' ? (
        <Box marginTop={1}>
          <Text color={theme.muted}>
            Add: s SSH key{addFlow.hasGitHub ? ' · g GitHub' : ''}
            {addFlow.oidcProviders.length > 0 ? ' · o OIDC' : ''} · Esc cancel
          </Text>
        </Box>
      ) : null}
      {addFlow.status === 'oidc_pick_provider' ? (
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.muted}>Choose OIDC provider (j/k, Enter):</Text>
          {addFlow.providers.map((p, i) => (
            <Text
              key={p.id}
              color={i === addFlow.selected ? theme.accent : theme.muted}
              bold={i === addFlow.selected}
            >
              {i === addFlow.selected ? '› ' : '  '}
              {p.displayName}
            </Text>
          ))}
        </Box>
      ) : null}
      {oauthFlow !== undefined ? (
        <Box marginTop={1} flexDirection="column">
          <Text bold>Link {oauthKind} account</Text>
          <Text>
            Open: <Text color={theme.accent}>{oauthFlow.verificationUri}</Text>
          </Text>
          <Text>
            Code:{' '}
            <Text color={theme.accent} bold>
              {oauthFlow.userCode}
            </Text>
          </Text>
          {isOauthPolling ? (
            <Text color={theme.muted}>Waiting for authorisation… Esc to cancel</Text>
          ) : (
            <Text color={theme.muted}>Authorise in the browser, then press Enter · Esc cancel</Text>
          )}
        </Box>
      ) : null}
      {addFlow.status === 'discovering' ? (
        <Text color={theme.muted}>Looking for SSH identities…</Text>
      ) : null}
      {addFlow.status === 'picking' ? (
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.muted}>Pick a key to enroll (j/k, Enter):</Text>
          {addFlow.candidates.map((candidate, index) => (
            <Text
              key={candidate.fingerprint}
              color={index === addFlow.selected ? theme.accent : theme.muted}
              bold={index === addFlow.selected}
            >
              {index === addFlow.selected ? '› ' : '  '}
              {describeCandidate(candidate)}
            </Text>
          ))}
        </Box>
      ) : null}
      {addFlow.status === 'enrolling' ? <Text color={theme.muted}>Enrolling…</Text> : null}
      {addFlow.status === 'done' ? <Text color={theme.ok}>{addFlow.message}</Text> : null}
      {addFlow.status === 'error' ? <Text color={theme.error}>{addFlow.message}</Text> : null}
      <Box marginTop={1} flexDirection="column">
        {e2eeEnrolledDeviceId !== undefined ? (
          <Text color={theme.muted}>
            Encrypted-messaging device enrolled here ({e2eeEnrolledDeviceId}) — D devices
          </Text>
        ) : e2eeEnrollAvailable ? (
          <Text color={theme.muted}>This device is not enrolled for encrypted messages yet.</Text>
        ) : null}
        {e2eeFlow.status === 'confirming' ? (
          <>
            <Text color={theme.warn} wrap="wrap">
              Enroll THIS computer as an encrypted-messaging device? Its keys are generated here and
              never leave it; the account’s device list gains one entry.
            </Text>
            <Text color={theme.muted}>y/Enter enroll · n/Esc cancel</Text>
          </>
        ) : null}
        {e2eeFlow.status === 'running' ? (
          <Text color={theme.muted}>Enrolling this device…</Text>
        ) : null}
        {e2eeFlow.status === 'done' ? (
          <>
            <Text color={theme.ok} wrap="wrap">
              {e2eeFlow.message}
            </Text>
            {e2eeFlow.peerWarning !== undefined ? (
              <Text color={theme.warn} wrap="wrap">
                {e2eeFlow.peerWarning}
              </Text>
            ) : null}
          </>
        ) : null}
        {e2eeFlow.status === 'error' ? (
          <Text color={theme.error} wrap="wrap">
            {e2eeFlow.message}
          </Text>
        ) : null}
      </Box>
      <Box marginTop={1}>
        <Text color={theme.muted}>
          a add credential · v revoke · j/k select
          {onOpenDevices !== undefined ? ' · D devices' : ''}
          {e2eeEnrollAvailable ? ' · e encrypt device' : ''} · x log out · Esc back
        </Text>
      </Box>
    </Box>
  );
}

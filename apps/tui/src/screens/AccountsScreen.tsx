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
import { CREDENTIAL_TYPE_SCHEMA, enumWireName } from '../api/wire/enums.js';

export interface AccountsScreenProps {
  api: PatchesApi;
  env: NodeJS.ProcessEnv;
  session: ActiveSession;
  isActive: boolean;
  ensureAccessToken: () => Promise<string>;
  /** `x` — signs out and returns to a logged-out screen. */
  onLogout: () => void;
  /** `r` — only offered while `session.emailVerified` is false (A-028); the code
   * itself still only arrives by email, entered via `patches verify <code>`. */
  onResendVerification: () => void;
  /** `Esc` — back to whichever screen `L` was pressed from. */
  onBack: () => void;
}

type CredentialsState =
  | { status: 'loading' }
  | { status: 'ready'; credentials: Credential[] }
  | { status: 'error'; error: FriendlyError };

type AddFlow =
  | { status: 'idle' }
  | { status: 'discovering' }
  | { status: 'picking'; candidates: EnrollmentCandidate[]; selected: number }
  | { status: 'enrolling' }
  | { status: 'done'; message: string }
  | { status: 'error'; message: string };

type RevokeFlow =
  | { status: 'idle' }
  | { status: 'confirming'; credential: Credential }
  | { status: 'revoking'; credential: Credential }
  | { status: 'done'; message: string }
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

/**
 * `L` when already signed in (P1-013/B-022 follow-up — the CLI-only `patches keys
 * add|list|remove` and `patches logout` finally get an in-app equivalent): lists
 * credentials (`AuthService.ListCredentials`), `j`/`k` selects one, `a` enrolls an SSH
 * key already loaded in the agent (reuses `ssh-enroll.ts` exactly like `cli/keys.ts
 * runKeysAdd` — never reads a private key, agent signs a local possession proof), `v`
 * revokes the selected credential behind a `y`/`n` confirm (P15-007 — the previous
 * version had list/add but no revoke UI at all), `x` logs out. The server's
 * `RevokeCredential` refuses to revoke an account's last remaining credential
 * (`AuthService#revokeCredential`, spec §165) and its own error message is already
 * comprehensible, so it renders through `describeGrpcError` unmodified.
 */
export function AccountsScreen({
  api,
  env,
  session,
  isActive,
  ensureAccessToken,
  onLogout,
  onResendVerification,
  onBack,
}: AccountsScreenProps): ReactElement {
  const [state, setState] = useState<CredentialsState>({ status: 'loading' });
  const [addFlow, setAddFlow] = useState<AddFlow>({ status: 'idle' });
  const [revokeFlow, setRevokeFlow] = useState<RevokeFlow>({ status: 'idle' });
  const [selectedCredential, setSelectedCredential] = useState(0);

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

  async function beginAdd(): Promise<void> {
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
      // The server's own last-credential-guard message (AuthService#RevokeCredential) is
      // already human-readable ("This is your only way to sign in…"), so it needs no
      // TUI-specific override the way `TUI_COPY` provides for other error codes.
      setRevokeFlow({ status: 'error', message: describeGrpcError(error, api.target).title });
    }
  }

  useInput(
    (input, key) => {
      if (key.escape) {
        if (revokeFlow.status === 'confirming') {
          setRevokeFlow({ status: 'idle' });
          return;
        }
        if (revokeFlow.status === 'done' || revokeFlow.status === 'error') {
          setRevokeFlow({ status: 'idle' });
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
        // any key dismisses, Esc already handled above
        setRevokeFlow({ status: 'idle' });
        return;
      }
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
      if (state.status === 'ready' && state.credentials.length > 0) {
        if (input === 'j' || key.downArrow) {
          setSelectedCredential((index) => Math.min(index + 1, state.credentials.length - 1));
          return;
        }
        if (input === 'k' || key.upArrow) {
          setSelectedCredential((index) => Math.max(index - 1, 0));
          return;
        }
        if (input === 'v') {
          const credential = state.credentials[selectedCredential];
          if (credential !== undefined) setRevokeFlow({ status: 'confirming', credential });
          return;
        }
      }
      if (input === 'a') {
        void beginAdd();
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
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.warn}>
            Revoke {describeCredentialRow(revokeFlow.credential)}? y confirm · n/Esc cancel
          </Text>
        </Box>
      ) : null}
      {revokeFlow.status === 'revoking' ? <Text color={theme.muted}>Revoking…</Text> : null}
      {revokeFlow.status === 'done' ? <Text color={theme.ok}>{revokeFlow.message}</Text> : null}
      {revokeFlow.status === 'error' ? <Text color={theme.error}>{revokeFlow.message}</Text> : null}
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
      <Box marginTop={1}>
        <Text color={theme.muted}>
          a add SSH key · v revoke selected · j/k select · x log out · Esc back
        </Text>
      </Box>
    </Box>
  );
}

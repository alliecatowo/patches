import { present } from '../api/present.js';
import type { Credential } from '@patches/proto';
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

function describeCandidate(candidate: EnrollmentCandidate): string {
  const where = candidate.knownAt.length === 0 ? '' : ` (${candidate.knownAt.join(', ')})`;
  return `${candidate.fingerprint}  ${candidate.algorithm}${where}`;
}

function describeCredentialRow(credential: Credential): string {
  const label = credential.label === '' ? '(no label)' : credential.label;
  const identifier = credential.identifier === '' ? '' : `  ${credential.identifier}`;
  return `${credential.type}  ${label}${identifier}`;
}

/**
 * `L` when already signed in (P1-013/B-022 follow-up — the CLI-only `patches keys
 * add|list` and `patches logout` finally get an in-app equivalent): lists credentials
 * (`AuthService.ListCredentials`), `a` enrolls an SSH key already loaded in the agent
 * (reuses `ssh-enroll.ts` exactly like `cli/keys.ts runKeysAdd` — never reads a private
 * key, agent signs a local possession proof), `x` logs out.
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

  useInput(
    (input, key) => {
      if (key.escape) {
        if (addFlow.status !== 'idle') {
          setAddFlow({ status: 'idle' });
          return;
        }
        onBack();
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
          ? state.credentials.map((credential) => (
              <Text key={credential.id} color={theme.muted}>
                {describeCredentialRow(credential)}
              </Text>
            ))
          : null}
      </Box>
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
        <Text color={theme.muted}>a add SSH key · x log out · Esc back</Text>
      </Box>
    </Box>
  );
}

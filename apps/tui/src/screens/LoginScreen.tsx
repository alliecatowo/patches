import { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import { PASSWORD_AUTH_MODE } from '../api/wire/enums.js';

import type { PatchesApi } from '../api/client.js';
import { describeGrpcError, type FriendlyError } from '../api/errors.js';
import { sshAuthSock } from '../auth/ssh-agent.js';
import { performSshLogin } from '../auth/ssh-login.js';
import type { ActiveSession, SessionManager } from '../auth/session.js';
import { resolveSshIdentity } from '../cli/auth-shared.js';
import { theme } from '../theme/index.js';

export interface LoginScreenProps {
  api: PatchesApi;
  sessionManager: SessionManager;
  env: NodeJS.ProcessEnv;
  onCancel: () => void;
  onSuccess: (session: ActiveSession) => void;
  isActive: boolean;
}

type Mode = 'choose' | 'password' | 'ssh' | 'unavailable';
type Field = 'emailOrHandle' | 'password';
type Status =
  { status: 'idle' } | { status: 'submitting' } | { status: 'error'; error: FriendlyError };

/**
 * Inline `L` login (deferred half of P1-007, spec §33/§166/§169). Password is
 * the default path; SSH-key login reuses `performSshLogin`/`resolveSshIdentity`
 * (already built for the CLI) rather than duplicating the handshake, and only
 * offers itself when an agent is actually reachable.
 */
export function LoginScreen({
  api,
  sessionManager,
  env,
  onCancel,
  onSuccess,
  isActive,
}: LoginScreenProps): ReactElement {
  const sshAvailable = sshAuthSock(env) !== undefined;
  const [mode, setMode] = useState<Mode>(sshAvailable ? 'choose' : 'password');
  const [field, setField] = useState<Field>('emailOrHandle');
  const [emailOrHandle, setEmailOrHandle] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>({ status: 'idle' });
  const [passwordAuthOff, setPasswordAuthOff] = useState(false);

  // P15-002: hide the password field entirely — not merely disable it — once we learn this
  // node has opted out of PASSWORD_AUTH. Runs once per mount; tolerant of an unreachable node
  // the same way every other node-capability read in this app is (password stays offered until
  // proven otherwise, rather than the screen failing to render at all).
  useEffect(() => {
    let cancelled = false;
    api
      .getAuthPolicy()
      .then(({ passwordAuth }) => {
        if (cancelled || passwordAuth !== PASSWORD_AUTH_MODE.OFF) return;
        setPasswordAuthOff(true);
        setMode((current) => {
          if (current !== 'password' && current !== 'choose') return current;
          if (sshAvailable) {
            void submitSsh();
            return 'ssh';
          }
          return 'unavailable';
        });
      })
      .catch(() => {
        // See the comment above — an unreachable node just leaves password offered.
      });
    return () => {
      cancelled = true;
    };
    // `submitSsh`/`sshAvailable` are stable for the life of this screen (constructed from
    // `api`/`env` props that never change after mount); re-running this on every render would
    // refire the policy fetch and could re-trigger `submitSsh()` mid-attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above
  }, [api]);

  async function submitPassword(): Promise<void> {
    if (emailOrHandle.trim() === '' || password === '') return;
    setStatus({ status: 'submitting' });
    try {
      const session = await sessionManager.loginWithPassword(emailOrHandle.trim(), password);
      onSuccess(session);
    } catch (error) {
      setStatus({
        status: 'error',
        error: describeGrpcError(error, api.target, { context: 'credentials' }),
      });
    }
  }

  async function submitSsh(): Promise<void> {
    setStatus({ status: 'submitting' });
    const resolved = await resolveSshIdentity(undefined, env);
    if ('error' in resolved) {
      setStatus({
        status: 'error',
        error: { title: resolved.error, hint: '', retryable: false, code: 0 },
      });
      return;
    }
    try {
      const response = await performSshLogin({
        api,
        nodeDomain: api.target,
        identity: resolved.identity,
        publicKeyOpenssh: resolved.publicKeyOpenssh,
        socketPath: resolved.socketPath,
      });
      const session = await sessionManager.applySshLoginResult(response);
      onSuccess(session);
    } catch (error) {
      setStatus({ status: 'error', error: describeGrpcError(error, api.target) });
    }
  }

  useInput(
    (input, key) => {
      if (status.status === 'submitting') return;

      // 'Q' is only a cancel shortcut outside the password field — a password
      // is free-form text and must be able to contain a literal "Q".
      if (key.escape || (input === 'Q' && mode !== 'password')) {
        onCancel();
        return;
      }

      if (mode === 'choose') {
        if (input === 'p' && !passwordAuthOff) setMode('password');
        else if (input === 's') {
          setMode('ssh');
          void submitSsh();
        }
        return;
      }

      if (mode === 'ssh') {
        if (input === 'r' && status.status === 'error') void submitSsh();
        return;
      }

      if (mode === 'unavailable') return;
      if (mode === 'password') {
        if (key.tab) {
          setField((current) => (current === 'emailOrHandle' ? 'password' : 'emailOrHandle'));
          return;
        }
        if (key.return) {
          if (field === 'emailOrHandle') setField('password');
          else void submitPassword();
          return;
        }
        if (key.backspace || key.delete) {
          if (field === 'emailOrHandle') setEmailOrHandle((value) => value.slice(0, -1));
          else setPassword((value) => value.slice(0, -1));
          return;
        }
        if (key.ctrl || key.meta) return;
        if (input.length > 0) {
          if (field === 'emailOrHandle') setEmailOrHandle((value) => value + input);
          else setPassword((value) => value + input);
        }
      }
    },
    { isActive },
  );

  if (mode === 'choose') {
    return (
      <Box flexDirection="column">
        <Text color={theme.accent}>Sign in to {api.target}</Text>
        <Text>{passwordAuthOff ? '(s)sh key?' : '(p)assword or (s)sh key?'}</Text>
        <Text color={theme.muted}>Esc cancel</Text>
      </Box>
    );
  }

  if (mode === 'unavailable') {
    return (
      <Box flexDirection="column">
        <Text color={theme.accent}>Sign in to {api.target}</Text>
        <Text color={theme.error}>
          This node does not accept password sign-in and no SSH agent is reachable here.
        </Text>
        <Text color={theme.muted}>
          Run `patches login --recovery` from a terminal, or connect an SSH agent. Esc cancel
        </Text>
      </Box>
    );
  }

  if (mode === 'ssh') {
    return (
      <Box flexDirection="column">
        <Text color={theme.accent}>Sign in to {api.target}</Text>
        {status.status === 'submitting' ? (
          <Text color={theme.muted}>Signing in with your SSH agent…</Text>
        ) : status.status === 'error' ? (
          <>
            <Text color={theme.error}>{status.error.title}</Text>
            <Text color={theme.muted}>r retry · Esc cancel</Text>
          </>
        ) : null}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color={theme.accent}>Sign in to {api.target}</Text>
      <Box marginTop={1} flexDirection="column">
        <LoginField
          label="email or handle"
          value={emailOrHandle}
          focused={field === 'emailOrHandle'}
        />
        <LoginField label="password" value={password} focused={field === 'password'} mask />
      </Box>
      {status.status === 'error' ? <Text color={theme.error}>{status.error.title}</Text> : null}
      <Text color={theme.muted}>
        {status.status === 'submitting'
          ? 'Signing in…'
          : 'Tab switch field · Enter next/submit · Esc cancel'}
      </Text>
    </Box>
  );
}

function LoginField({
  label,
  value,
  focused,
  mask = false,
}: {
  label: string;
  value: string;
  focused: boolean;
  mask?: boolean;
}): ReactElement {
  const shown = mask ? '*'.repeat(value.length) : value;
  return (
    <Box>
      <Box width={16}>
        <Text color={theme.muted}>{label}</Text>
      </Box>
      <Text color={focused ? theme.accent : theme.text}>
        {shown}
        {focused ? '█' : ''}
      </Text>
    </Box>
  );
}

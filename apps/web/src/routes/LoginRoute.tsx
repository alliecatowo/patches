import { describeError } from '@patches/client';
import { PasswordAuthMode } from '@patches/proto/es';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent, type JSX } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { api, establishSession } from '../api/client.js';
import { DeviceLinkButton } from '../components/DeviceLinkButton.js';
import { GitHubLoginButton } from '../components/GitHubLoginButton.js';
import { OidcLoginButton } from '../components/OidcLoginButton.js';
import { PasskeyLoginButton } from '../components/PasskeyLoginButton.js';
import { useAbortableMutation } from '../hooks/useAbortableMutation.js';
import styles from './AuthForm.module.css';

export function LoginRoute(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const [emailOrHandle, setEmailOrHandle] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  // P15-003: an explicit toggle, not auto-selected even when PASSWORD_AUTH is off — a
  // recovery code is a fallback path a viewer reaches for on purpose, never the default.
  const [useRecovery, setUseRecovery] = useState(false);

  // P15-002: read before rendering the password field — a node with PASSWORD_AUTH=off never
  // gets to see it, not merely a disabled one. Defaults to "password allowed" while loading/on
  // failure, same tolerance the rest of this app gives an unreachable node-capability read.
  const authPolicyQuery = useQuery({
    queryKey: ['auth-policy'],
    queryFn: () => api.auth.getAuthPolicy({}),
    staleTime: 60_000,
  });
  const passwordAuthOff = authPolicyQuery.data?.passwordAuth === PasswordAuthMode.OFF;

  // B-164: leaving `/login` (e.g. via the "Register" link) before either RPC settles must
  // not later establish a session and redirect out from under the screen navigated to.
  const loginMutation = useAbortableMutation({
    mutationFn: (_variables: void, signal) =>
      api.auth.login({ emailOrHandle, password }, { signal }),
    onSuccess: async (response) => {
      if (response.session) await establishSession(response.session);
      const from = (location.state as { from?: string } | null)?.from ?? '/';
      void navigate(from, { replace: true });
    },
  });

  const recoveryMutation = useAbortableMutation({
    mutationFn: (_variables: void, signal) =>
      api.auth.recoveryLogin({ emailOrHandle, code: recoveryCode }, { signal }),
    onSuccess: async (response) => {
      if (response.session) await establishSession(response.session);
      const from = (location.state as { from?: string } | null)?.from ?? '/';
      void navigate(from, { replace: true });
    },
  });

  const showRecovery = useRecovery || passwordAuthOff;
  const mutation = showRecovery ? recoveryMutation : loginMutation;

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    mutation.mutate();
  };

  return (
    <div className={styles['wrap']}>
      <h1>Sign in</h1>
      {mutation.isError ? (
        <p className={styles['error']}>
          {describeError(mutation.error, { context: 'credentials' }).message}
        </p>
      ) : null}
      <form onSubmit={onSubmit}>
        <div className={styles['field']}>
          <label htmlFor="login-id">Email or handle</label>
          <input
            id="login-id"
            value={emailOrHandle}
            onChange={(e) => setEmailOrHandle(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        {showRecovery ? (
          <div className={styles['field']}>
            <label htmlFor="login-recovery-code">Recovery code</label>
            <input
              id="login-recovery-code"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              autoComplete="off"
              required
            />
          </div>
        ) : (
          <div className={styles['field']}>
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
        )}
        <button type="submit" className={styles['submit']} disabled={mutation.isPending}>
          {mutation.isPending
            ? 'Signing in…'
            : showRecovery
              ? 'Sign in with recovery code'
              : 'Sign in'}
        </button>
      </form>
      <p className={styles['switchLink']}>or</p>
      <PasskeyLoginButton />
      {authPolicyQuery.data?.githubAuth ? <GitHubLoginButton /> : null}
      {authPolicyQuery.data?.oidcProviders.map((provider) => (
        <OidcLoginButton key={provider.id} provider={provider} />
      ))}
      <DeviceLinkButton />
      {!passwordAuthOff ? (
        <p className={styles['switchLink']}>
          <button
            type="button"
            className={styles['linkButton']}
            onClick={() => setUseRecovery((v) => !v)}
          >
            {useRecovery ? 'Use a password instead' : 'Use a recovery code instead'}
          </button>
        </p>
      ) : null}
      <p className={styles['switchLink']}>
        No account? <Link to="/register">Register with an invite code</Link>
      </p>
      {!passwordAuthOff ? (
        <p className={styles['switchLink']}>
          <Link to="/reset-password">Forgot your password?</Link>
        </p>
      ) : null}
    </div>
  );
}

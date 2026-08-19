import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent, type JSX } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { api } from '../api/client.js';
import { describeError } from '../api/errors.js';
import { fromProtoSession, setSession } from '../api/session.js';
import styles from './AuthForm.module.css';

export function LoginRoute(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const [emailOrHandle, setEmailOrHandle] = useState('');
  const [password, setPassword] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.auth.login({ emailOrHandle, password }),
    onSuccess: (response) => {
      const stored = response.session ? fromProtoSession(response.session) : null;
      if (stored) setSession(stored);
      const from = (location.state as { from?: string } | null)?.from ?? '/';
      void navigate(from, { replace: true });
    },
  });

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    mutation.mutate();
  };

  return (
    <div className={styles['wrap']}>
      <h1>Sign in</h1>
      {mutation.isError ? (
        <p className={styles['error']}>{describeError(mutation.error).message}</p>
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
        <button type="submit" className={styles['submit']} disabled={mutation.isPending}>
          {mutation.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className={styles['switchLink']}>
        No account? <Link to="/register">Register with an invite code</Link>
      </p>
    </div>
  );
}

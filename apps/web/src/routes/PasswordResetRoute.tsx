import { describeError } from '@patches/client';
import { useState, type FormEvent, type JSX } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { api } from '../api/client.js';
import { useAbortableMutation } from '../hooks/useAbortableMutation.js';
import styles from './AuthForm.module.css';

/**
 * Password recovery deliberately makes no claim about whether an address has an account:
 * `RequestPasswordReset` has a uniform successful response for that reason. The reset code
 * itself is only ever held in this form long enough to submit it.
 */
export function PasswordResetRoute(): JSX.Element {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [requested, setRequested] = useState(false);

  const requestMutation = useAbortableMutation({
    mutationFn: (_variables: void, signal) => api.auth.requestPasswordReset({ email }, { signal }),
    onSuccess: () => setRequested(true),
  });
  const resetMutation = useAbortableMutation({
    mutationFn: (_variables: void, signal) =>
      api.auth.resetPassword({ code, newPassword }, { signal }),
    onSuccess: () => void navigate('/login', { replace: true }),
  });

  const requestReset = (event: FormEvent): void => {
    event.preventDefault();
    requestMutation.mutate();
  };
  const resetPassword = (event: FormEvent): void => {
    event.preventDefault();
    resetMutation.mutate();
  };

  return (
    <div className={styles['wrap']}>
      <h1>Reset password</h1>
      {!requested ? (
        <>
          <p className={styles['helpText']}>
            Enter your verified recovery email and we&apos;ll send a reset code if this account can
            use password recovery.
          </p>
          {requestMutation.isError ? (
            <p className={styles['error']}>{describeError(requestMutation.error).message}</p>
          ) : null}
          <form onSubmit={requestReset}>
            <div className={styles['field']}>
              <label htmlFor="reset-email">Recovery email</label>
              <input
                id="reset-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <button type="submit" className={styles['submit']} disabled={requestMutation.isPending}>
              {requestMutation.isPending ? 'Requesting…' : 'Send reset code'}
            </button>
          </form>
        </>
      ) : (
        <>
          <p role="status" className={styles['helpText']}>
            If that address can reset a password, a code is on its way. Enter it below to choose a
            new password.
          </p>
          {resetMutation.isError ? (
            <p className={styles['error']}>{describeError(resetMutation.error).message}</p>
          ) : null}
          <form onSubmit={resetPassword}>
            <div className={styles['field']}>
              <label htmlFor="reset-code">Reset code</label>
              <input
                id="reset-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                autoComplete="one-time-code"
                required
              />
            </div>
            <div className={styles['field']}>
              <label htmlFor="reset-password">New password</label>
              <input
                id="reset-password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <button type="submit" className={styles['submit']} disabled={resetMutation.isPending}>
              {resetMutation.isPending ? 'Resetting…' : 'Reset password'}
            </button>
          </form>
        </>
      )}
      <p className={styles['switchLink']}>
        Remembered it? <Link to="/login">Sign in</Link>
      </p>
    </div>
  );
}

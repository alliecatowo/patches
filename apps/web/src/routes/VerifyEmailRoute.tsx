import { describeError } from '@patches/client';
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent, type JSX } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../api/client.js';
import styles from './AuthForm.module.css';

/** Authenticated verification/resend surface; resend intentionally has no email input. */
export function VerifyEmailRoute(): JSX.Element {
  const [code, setCode] = useState('');
  const verifyMutation = useMutation({ mutationFn: () => api.auth.verifyEmail({ code }) });
  const resendMutation = useMutation({ mutationFn: () => api.auth.resendVerification({}) });

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    verifyMutation.mutate();
  };

  return (
    <div className={styles['wrap']}>
      <h1>Verify your email</h1>
      <p className={styles['helpText']}>
        Enter the code sent to your recovery email. It is used for password recovery, not as your
        public identity.
      </p>
      {verifyMutation.isSuccess ? <p role="status">Your email is verified.</p> : null}
      {verifyMutation.isError ? (
        <p className={styles['error']}>{describeError(verifyMutation.error).message}</p>
      ) : null}
      <form onSubmit={onSubmit}>
        <div className={styles['field']}>
          <label htmlFor="verification-code">Verification code</label>
          <input
            id="verification-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            autoComplete="one-time-code"
            required
          />
        </div>
        <button type="submit" className={styles['submit']} disabled={verifyMutation.isPending}>
          {verifyMutation.isPending ? 'Verifying…' : 'Verify email'}
        </button>
      </form>
      {resendMutation.isError ? (
        <p className={styles['error']}>{describeError(resendMutation.error).message}</p>
      ) : null}
      <p className={styles['switchLink']}>
        Didn&apos;t receive a code?{' '}
        <button
          type="button"
          className={styles['linkButton']}
          onClick={() => resendMutation.mutate()}
          disabled={resendMutation.isPending}
        >
          {resendMutation.isPending
            ? 'Sending…'
            : resendMutation.isSuccess
              ? 'Code resent'
              : 'Resend it'}
        </button>
      </p>
      <p className={styles['switchLink']}>
        <Link to="/">Back to Patches</Link>
      </p>
    </div>
  );
}

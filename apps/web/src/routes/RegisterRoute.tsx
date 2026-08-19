import { useMutation } from '@tanstack/react-query';
import { useState, type ChangeEvent, type FormEvent, type JSX } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { api } from '../api/client.js';
import { describeError } from '../api/errors.js';
import { fromProtoSession, setSession } from '../api/session.js';
import styles from './AuthForm.module.css';

/** `/register` — this node is invite-only (spec §33), so `inviteCode` is required. */
export function RegisterRoute(): JSX.Element {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: '',
    handle: '',
    displayName: '',
    password: '',
    inviteCode: '',
  });

  const mutation = useMutation({
    mutationFn: () =>
      api.auth.register({
        email: form.email,
        handle: form.handle,
        displayName: form.displayName,
        password: form.password,
        inviteCode: form.inviteCode,
        clientRequestId: crypto.randomUUID(),
        sshPublicKey: '',
      }),
    onSuccess: (response) => {
      const stored = response.session ? fromProtoSession(response.session) : null;
      if (stored) setSession(stored);
      void navigate('/', { replace: true });
    },
  });

  const set = (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: event.target.value }));

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    mutation.mutate();
  };

  return (
    <div className={styles['wrap']}>
      <h1>Register</h1>
      {mutation.isError ? (
        <p className={styles['error']}>{describeError(mutation.error).message}</p>
      ) : null}
      <form onSubmit={onSubmit}>
        <div className={styles['field']}>
          <label htmlFor="reg-invite">Invite code</label>
          <input id="reg-invite" value={form.inviteCode} onChange={set('inviteCode')} required />
        </div>
        <div className={styles['field']}>
          <label htmlFor="reg-handle">Handle</label>
          <input
            id="reg-handle"
            value={form.handle}
            onChange={set('handle')}
            autoComplete="username"
            required
          />
        </div>
        <div className={styles['field']}>
          <label htmlFor="reg-display-name">Display name</label>
          <input id="reg-display-name" value={form.displayName} onChange={set('displayName')} />
        </div>
        <div className={styles['field']}>
          <label htmlFor="reg-email">Email</label>
          <input
            id="reg-email"
            type="email"
            value={form.email}
            onChange={set('email')}
            autoComplete="email"
            required
          />
        </div>
        <div className={styles['field']}>
          <label htmlFor="reg-password">Password</label>
          <input
            id="reg-password"
            type="password"
            value={form.password}
            onChange={set('password')}
            autoComplete="new-password"
            required
          />
        </div>
        <button type="submit" className={styles['submit']} disabled={mutation.isPending}>
          {mutation.isPending ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className={styles['switchLink']}>
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </div>
  );
}

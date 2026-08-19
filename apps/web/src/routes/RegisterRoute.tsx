import { describeError } from '@patches/client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type ChangeEvent, type FormEvent, type JSX } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { api, establishSession } from '../api/client.js';
import styles from './AuthForm.module.css';

/** `/register` — this node is invite-only (spec §33), so `inviteCode` is required.
 * The privacy notice is shown before submit, never after (spec §197.1) — the
 * acknowledgement checkbox gates the submit button, and once the account exists we
 * record the acknowledgement server-side via `PrivacyService.AcknowledgePrivacyNotice`. */
export function RegisterRoute(): JSX.Element {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: '',
    handle: '',
    displayName: '',
    password: '',
    inviteCode: '',
  });
  const [noticeAcknowledged, setNoticeAcknowledged] = useState(false);

  const policyQuery = useQuery({
    queryKey: ['node-policy'],
    queryFn: () => api.node.getNodePolicy({}),
    staleTime: 60_000,
  });
  const policy = policyQuery.data?.policy;

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
    onSuccess: async (response) => {
      if (response.session) await establishSession(response.session);
      if (policy) {
        try {
          await api.privacy.acknowledgePrivacyNotice({
            noticeVersion: policy.privacyNoticeVersion,
          });
        } catch {
          // Non-fatal — the account exists either way; the privacy screen will offer
          // acknowledgement again next visit.
        }
      }
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
        <div className={styles['field']}>
          <p style={{ fontSize: '0.85rem', color: 'var(--fg-muted)' }}>
            {policy?.privacyNoticeSummary || 'This node has not published a privacy notice.'}
          </p>
          <p style={{ fontSize: '0.85rem', color: 'var(--fg-muted)' }}>
            Direct messages on this node are <strong>server-visible</strong>, not end-to-end
            encrypted — operators can read them.
          </p>
          {policy?.privacyNoticeUrl ? (
            <p>
              <a href={policy.privacyNoticeUrl} target="_blank" rel="noopener noreferrer">
                Read the full privacy notice
              </a>
            </p>
          ) : null}
          <label>
            <input
              type="checkbox"
              checked={noticeAcknowledged}
              onChange={(e) => setNoticeAcknowledged(e.target.checked)}
            />{' '}
            I have read the privacy notice
          </label>
        </div>
        <button
          type="submit"
          className={styles['submit']}
          disabled={mutation.isPending || !noticeAcknowledged}
        >
          {mutation.isPending ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className={styles['switchLink']}>
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </div>
  );
}

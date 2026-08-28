import { describeError } from '@patches/client';
import { PasswordAuthMode } from '@patches/proto/es';
import { useQuery } from '@tanstack/react-query';
import { useState, type ChangeEvent, type FormEvent, type JSX } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { api, establishSession } from '../api/client.js';
import { useAbortableMutation } from '../hooks/useAbortableMutation.js';
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

  // P15-002: hidden, not merely disabled, when this node has opted out of PASSWORD_AUTH — see
  // `LoginRoute`'s identical read. The web client has no SSH-key enrollment flow, so a node
  // running PASSWORD_AUTH=off cannot be registered on from here at all; the form says so
  // rather than submitting a request the server will reject.
  const authPolicyQuery = useQuery({
    queryKey: ['auth-policy'],
    queryFn: () => api.auth.getAuthPolicy({}),
    staleTime: 60_000,
  });
  const passwordAuthOff = authPolicyQuery.data?.passwordAuth === PasswordAuthMode.OFF;

  // B-164: registering, then navigating away from `/register` before the RPC round-trip
  // (and the two follow-up calls in `onSuccess`) finishes must not later establish a
  // session and redirect out from under whatever screen the viewer moved to instead.
  const mutation = useAbortableMutation({
    mutationFn: (_variables: void, signal) =>
      api.auth.register(
        {
          email: form.email,
          handle: form.handle,
          displayName: form.displayName,
          password: form.password,
          inviteCode: form.inviteCode,
          clientRequestId: crypto.randomUUID(),
          sshPublicKey: '',
          // §204.2: the notice shown above (`policy.privacyNoticeSummary`) is what the
          // acknowledgement checkbox gates submit on — send the version it belongs to so a
          // REQUIRE_PRIVACY_ACK node can verify it's current, and record it in this same call.
          privacyNoticeVersionAcknowledged: policy?.privacyNoticeVersion ?? 0,
        },
        { signal },
      ),
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
        {passwordAuthOff ? (
          <p className={styles['error']}>
            This node does not accept password sign-up. Registration from the web client isn't
            available here — use the Patches TUI (`patches register --ssh-key`) instead.
          </p>
        ) : (
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
        )}
        <div className={styles['field']}>
          <p style={{ fontSize: '0.85rem', color: 'var(--fg-muted)' }}>
            {policy?.privacyNoticeSummary || 'This server has not published a privacy notice.'}
          </p>
          <p style={{ fontSize: '0.85rem', color: 'var(--fg-muted)' }}>
            Direct messages on this server are <strong>server-visible</strong>, not end-to-end
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
          disabled={mutation.isPending || !noticeAcknowledged || passwordAuthOff}
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

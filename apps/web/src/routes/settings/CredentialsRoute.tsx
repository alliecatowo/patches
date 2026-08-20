import { describeError } from '@patches/client';
import { CredentialType } from '@patches/proto/es';
import { startRegistration } from '@simplewebauthn/browser';
import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type JSX } from 'react';

import { api } from '../../api/client.js';
import { humanizeEnumValue } from '../../lib/enumLabels.js';
import { formatAbsoluteTime } from '../../lib/format.js';
import styles from '../AuthForm.module.css';

/**
 * `/settings/credentials` (P15-004, ADR 0022) — every way into the account (password, SSH key,
 * GitHub, recovery codes, passkeys) in one list, with revoke, plus "register a new passkey".
 * Passkeys are enrolled through their own `BeginPasskeyRegistration`/`CompletePasskeyRegistration`
 * pair, never through the generic add-credential flow the other types use — there is no add
 * form for `PASSKEY` here by design.
 */
export function CredentialsRoute(): JSX.Element {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');

  const credentialsQuery = useQuery({
    queryKey: ['credentials'],
    queryFn: () => api.auth.listCredentials({}),
  });

  const invalidate = (): void => void queryClient.invalidateQueries({ queryKey: ['credentials'] });

  const registerPasskeyMutation = useMutation({
    mutationFn: async () => {
      const begun = await api.auth.beginPasskeyRegistration({});
      const optionsJSON = JSON.parse(begun.optionsJson) as PublicKeyCredentialCreationOptionsJSON;
      const credential = await startRegistration({ optionsJSON });
      return api.auth.completePasskeyRegistration({
        credentialJson: JSON.stringify(credential),
        label,
      });
    },
    onSuccess: () => {
      setLabel('');
      invalidate();
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.auth.revokeCredential({ id }),
    onSuccess: invalidate,
  });

  return (
    <div className={styles['wrap']} style={{ margin: 0, maxWidth: 'none' }}>
      <h1>Sign-in methods</h1>

      <section>
        <h2>Your credentials</h2>
        {credentialsQuery.isPending ? <p>Loading…</p> : null}
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {credentialsQuery.data?.credentials.map((credential) => (
            <li
              key={credential.id}
              style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}
            >
              <strong>{humanizeEnumValue(credential.type, CredentialType)}</strong>
              {credential.label ? ` — ${credential.label}` : ''}
              <div style={{ fontSize: '0.85rem', color: 'var(--fg-muted)' }}>
                Added {formatAbsoluteTime(credential.createdAt)}
                {credential.lastUsedAt
                  ? `, last used ${formatAbsoluteTime(credential.lastUsedAt)}`
                  : ''}
              </div>
              <button
                type="button"
                style={{ marginTop: '0.35rem' }}
                onClick={() => revokeMutation.mutate(credential.id)}
                disabled={revokeMutation.isPending}
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2>Add a passkey</h2>
        <p>
          A passkey signs you in with your device&apos;s built-in security (Face ID, Touch ID, a
          security key, or your password manager) instead of a password.
        </p>
        {registerPasskeyMutation.isError ? (
          <p className={styles['error']}>{describeError(registerPasskeyMutation.error).message}</p>
        ) : null}
        <div className={styles['field']}>
          <label htmlFor="passkey-label">Label (e.g. &quot;work laptop&quot;)</label>
          <input id="passkey-label" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <button
          type="button"
          className={styles['submit']}
          style={{ width: 'auto' }}
          onClick={() => registerPasskeyMutation.mutate()}
          disabled={registerPasskeyMutation.isPending}
        >
          {registerPasskeyMutation.isPending ? 'Waiting for your device…' : 'Add a passkey'}
        </button>
      </section>
    </div>
  );
}

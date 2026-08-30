import { describeError } from '@patches/client';
import { CredentialType } from '@patches/proto/es';
import { startRegistration } from '@simplewebauthn/browser';
import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type JSX } from 'react';

import { api } from '../../api/client.js';
import { GitHubLoginButton } from '../../components/GitHubLoginButton.js';
import { OidcLoginButton } from '../../components/OidcLoginButton.js';
import { humanizeEnumValue } from '../../lib/enumLabels.js';
import { formatAbsoluteTime } from '../../lib/format.js';
import styles from '../AuthForm.module.css';

/**
 * `/settings/credentials` (P15-004, ADR 0022) — every way into the account (password, SSH key,
 * GitHub, recovery codes, passkeys) in one list, with revoke, plus "register a new passkey".
 * Passkeys are enrolled through their own `BeginPasskeyRegistration`/`CompletePasskeyRegistration`
 * pair, never through the generic add-credential flow the other types use — there is no add
 * form for `PASSKEY` here by design.
 *
 * GitHub/OIDC linking (P15-007) reuses `GitHubLoginButton`/`OidcLoginButton` in `mode="link"`:
 * the exact same `BeginGitHubLogin`/`BeginOidcLogin` RPCs the login screen uses, distinguished
 * server-side only by whether the call carries a bearer token (spec §167). Gated on
 * `GetAuthPolicyResponse.github_auth`/`oidc_providers`, same as `LoginRoute`.
 */
export function CredentialsRoute(): JSX.Element {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const credentialsQuery = useQuery({
    queryKey: ['credentials'],
    queryFn: () => api.auth.listCredentials({}),
  });

  const authPolicyQuery = useQuery({
    queryKey: ['auth-policy'],
    queryFn: () => api.auth.getAuthPolicy({}),
    staleTime: 60_000,
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

  const recoveryCodesMutation = useMutation({
    mutationFn: () => api.auth.generateRecoveryCodes({}),
    onSuccess: invalidate,
  });

  const changePasswordMutation = useMutation({
    mutationFn: () => api.auth.changePassword({ currentPassword, newPassword }),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
  });

  return (
    <div className={styles['wrap']} style={{ margin: 0, maxWidth: 'none' }}>
      <h1>Sign-in methods</h1>

      <section>
        <h2>Your credentials</h2>
        {credentialsQuery.isPending ? <p>Loading…</p> : null}
        {revokeMutation.isError ? (
          <p className={styles['error']}>{describeError(revokeMutation.error).message}</p>
        ) : null}
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
        <h2>Change password</h2>
        <p>Enter your current password and choose a new one. Other sessions will be signed out.</p>
        {changePasswordMutation.isError ? (
          <p className={styles['error']}>{describeError(changePasswordMutation.error).message}</p>
        ) : null}
        {changePasswordMutation.isSuccess ? <p>Password changed successfully.</p> : null}
        <div className={styles['field']}>
          <label htmlFor="current-password">Current password</label>
          <input id="current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </div>
        <div className={styles['field']}>
          <label htmlFor="new-password">New password</label>
          <input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
        <div className={styles['field']}>
          <label htmlFor="confirm-password">Confirm new password</label>
          <input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        </div>
        <button type="button" className={styles['submit']} style={{ width: 'auto' }}
          onClick={() => changePasswordMutation.mutate()}
          disabled={changePasswordMutation.isPending || newPassword !== confirmPassword || currentPassword === '' || newPassword === ''}>
          {changePasswordMutation.isPending ? 'Changing…' : 'Change password'}
        </button>
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

      {authPolicyQuery.data?.githubAuth || (authPolicyQuery.data?.oidcProviders.length ?? 0) > 0 ? (
        <section style={{ marginTop: '1.5rem' }}>
          <h2>Link another account</h2>
          <p>
            Link GitHub or another sign-in provider as an additional way into this Patches account.
            Neither imports a profile — it is only a credential, never an identity (spec §167).
          </p>
          {authPolicyQuery.data?.githubAuth ? (
            <GitHubLoginButton mode="link" onLinked={invalidate} />
          ) : null}
          {authPolicyQuery.data?.oidcProviders.map((provider) => (
            <OidcLoginButton
              key={provider.id}
              provider={provider}
              mode="link"
              onLinked={invalidate}
            />
          ))}
        </section>
      ) : null}

      <section style={{ marginTop: '1.5rem' }}>
        <h2>Recovery codes</h2>
        <p>
          Ten single-use codes for signing in if you lose every other credential (an SSH-only or
          GitHub-only account, for example). Generating a new set immediately invalidates any codes
          from a previous batch — this node shows them to you exactly once, right here.
        </p>
        {recoveryCodesMutation.isError ? (
          <p className={styles['error']}>{describeError(recoveryCodesMutation.error).message}</p>
        ) : null}
        {recoveryCodesMutation.data ? (
          <ul>
            {recoveryCodesMutation.data.codes.map((code) => (
              <li key={code}>
                <code>{code}</code>
              </li>
            ))}
          </ul>
        ) : null}
        <button
          type="button"
          className={styles['submit']}
          style={{ width: 'auto' }}
          onClick={() => {
            if (
              recoveryCodesMutation.data === undefined ||
              window.confirm(
                'This replaces any recovery codes you generated before — they will stop working. Continue?',
              )
            ) {
              recoveryCodesMutation.mutate();
            }
          }}
          disabled={recoveryCodesMutation.isPending}
        >
          {recoveryCodesMutation.isPending
            ? 'Generating…'
            : recoveryCodesMutation.data
              ? 'Generate a new set'
              : 'Generate recovery codes'}
        </button>
      </section>
    </div>
  );
}

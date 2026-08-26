import { describeError } from '@patches/client';
import { startAuthentication } from '@simplewebauthn/browser';
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import type { JSX } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { api, establishSession } from '../api/client.js';
import { useAbortableMutation } from '../hooks/useAbortableMutation.js';
import styles from '../routes/AuthForm.module.css';

/**
 * "Sign in with a passkey" (P15-004, ADR 0022) — the discoverable-credential login ceremony:
 * `BeginPasskeyLogin` (unauthenticated, no username field anywhere) → the browser's own
 * `startAuthentication()` prompt → `CompletePasskeyLogin` → the same session-establishment path
 * every other login method uses. Rendered from `LoginRoute` alongside password/recovery-code
 * sign-in, not a replacement for either.
 */
export function PasskeyLoginButton(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();

  // B-164: the WebAuthn ceremony itself (`startAuthentication`) isn't cancellable from
  // here, but unmounting mid-flight (navigating away while the passkey prompt is up) must
  // still not run `onSuccess` afterward and establish a session/redirect for a screen
  // that's gone — `useAbortableMutation`'s mounted-check on the callbacks covers that even
  // though the ceremony step itself ignores `signal`.
  const mutation = useAbortableMutation({
    mutationFn: async (_variables: void, signal) => {
      const begun = await api.auth.beginPasskeyLogin({}, { signal });
      const optionsJSON = JSON.parse(begun.optionsJson) as PublicKeyCredentialRequestOptionsJSON;
      const credential = await startAuthentication({ optionsJSON });
      return api.auth.completePasskeyLogin(
        { credentialJson: JSON.stringify(credential) },
        { signal },
      );
    },
    onSuccess: async (response) => {
      if (!response.session) return;
      await establishSession(response.session);
      const from = (location.state as { from?: string } | null)?.from ?? '/';
      void navigate(from, { replace: true });
    },
  });

  return (
    <div>
      {mutation.isError ? (
        <p className={styles['error']}>
          {describeError(mutation.error, { context: 'credentials' }).message}
        </p>
      ) : null}
      <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        {mutation.isPending ? 'Waiting for your passkey…' : 'Sign in with a passkey'}
      </button>
    </div>
  );
}

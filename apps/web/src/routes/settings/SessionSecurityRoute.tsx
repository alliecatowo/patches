import { describeError } from '@patches/client';
import { useMutation } from '@tanstack/react-query';
import type { JSX } from 'react';
import { useNavigate } from 'react-router-dom';

import { api, signOut } from '../../api/client.js';
import styles from '../AuthForm.module.css';

/**
 * The protocol offers no per-session listing, so this page must not imply it can identify
 * devices. Its one action revokes every session, including this browser, then clears local
 * credentials regardless of the response so a reuse-recovery event cannot leave stale UI.
 */
export function SessionSecurityRoute(): JSX.Element {
  const navigate = useNavigate();
  const logoutAllMutation = useMutation({
    mutationFn: () => api.auth.logoutAllSessions({}),
    onSuccess: async () => {
      await signOut();
      void navigate('/login', { replace: true });
    },
  });

  return (
    <div className={styles['wrap']} style={{ margin: 0, maxWidth: 'none' }}>
      <h1>Session security</h1>
      <section>
        <h2>Signed-in sessions</h2>
        <p className={styles['helpText']}>
          If you think a session or refresh token was exposed, sign out everywhere. This revokes all
          of your sessions, including this browser; you will need to sign in again on every device.
        </p>
        {logoutAllMutation.isError ? (
          <p className={styles['error']}>{describeError(logoutAllMutation.error).message}</p>
        ) : null}
        <button
          type="button"
          className={styles['submit']}
          style={{ width: 'auto' }}
          disabled={logoutAllMutation.isPending}
          onClick={() => {
            if (window.confirm('Sign out on every device? You will need to sign in again.')) {
              logoutAllMutation.mutate();
            }
          }}
        >
          {logoutAllMutation.isPending ? 'Signing out…' : 'Sign out everywhere'}
        </button>
      </section>
      <section style={{ marginTop: '1.5rem' }}>
        <h2>Refresh-token recovery</h2>
        <p className={styles['helpText']}>
          Patches rotates refresh tokens. If a rotated token is reused, the server revokes its
          session family and this browser asks you to sign in again. Use “Sign out everywhere” when
          you need to invalidate every session, not only this browser.
        </p>
      </section>
    </div>
  );
}

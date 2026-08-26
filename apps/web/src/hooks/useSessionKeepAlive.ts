import { useEffect } from 'react';

import { api } from '../api/client.js';
import { useSessionExpiry } from './useSession.js';

/**
 * B-161/B-169: `useSessionExpiry` (the access token's decoded `exp`) had no caller —
 * an idle tab with no other RPC in flight never noticed its access token going stale,
 * nor a *dead refresh token*, until the user's next interaction triggered one. Scheduling
 * a lightweight authenticated call (`ListCredentials`, chosen for carrying no business
 * data) right at expiry forces `authInterceptor`'s existing refresh-or-sign-out path
 * (`api/client.ts`) to run on a timer instead of waiting on user action — so the
 * session-expired toast and redirect fire even for a tab nobody touched.
 */
export function useSessionKeepAlive(): void {
  const expiresAt = useSessionExpiry();

  useEffect(() => {
    if (expiresAt === undefined) return;
    const delay = Math.max(0, expiresAt - Date.now());
    const timer = setTimeout(() => {
      // Failure here is expected and already fully handled by authInterceptor
      // (refresh attempt, then signOut + session-expired toast on a dead refresh token).
      void api.auth.listCredentials({}).catch(() => undefined);
    }, delay);
    return () => clearTimeout(timer);
  }, [expiresAt]);
}

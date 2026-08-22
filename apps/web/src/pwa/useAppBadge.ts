import { useEffect } from 'react';

/**
 * Synchronize the PWA App Badging API with unread notification count.
 */
export function useAppBadge(count: number | undefined): void {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('setAppBadge' in navigator)) {
      return;
    }

    if (count !== undefined && count > 0) {
      void Promise.resolve(navigator.setAppBadge(count)).catch(() => {});
    } else if ('clearAppBadge' in navigator) {
      void Promise.resolve(navigator.clearAppBadge()).catch(() => {});
    }
  }, [count]);
}

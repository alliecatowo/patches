import { useEffect, useRef } from 'react';

import { reportAppBadgeOperation } from './appBadgeStatus.js';

interface AppBadgeNavigator {
  readonly setAppBadge?: (contents?: number) => Promise<void>;
  readonly clearAppBadge?: () => Promise<void>;
}

function appBadgeNavigator(): AppBadgeNavigator | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return navigator;
}

function ignoreBadgeFailure(): void {
  // Badging is an optional OS integration. Permission and lifecycle failures must not affect UI.
  reportAppBadgeOperation('failed');
}

/**
 * Synchronize the PWA App Badging API with the currently signed-in actor's unread count.
 *
 * The browser API is capability-detected because it is unavailable in many browsers and may
 * reject when the PWA is not installed or notification permission is unavailable. Operations
 * are serialized so a clear requested during sign-out or an account switch cannot race a later
 * badge update.
 */
export function useAppBadge(count: number | undefined, actorId: string | undefined): void {
  const previousActorId = useRef<string | undefined>(actorId);
  const pendingOperation = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const badge = appBadgeNavigator();
    if (badge === undefined) {
      return;
    }

    const actorChanged = previousActorId.current !== actorId;
    previousActorId.current = actorId;
    const shouldSetBadge = actorId !== undefined && count !== undefined && count > 0;

    pendingOperation.current = pendingOperation.current
      .catch(ignoreBadgeFailure)
      .then(async () => {
        if (actorChanged && badge.clearAppBadge !== undefined) {
          await badge.clearAppBadge();
          reportAppBadgeOperation('cleared');
        }
        if (shouldSetBadge && badge.setAppBadge !== undefined) {
          await badge.setAppBadge(count);
          reportAppBadgeOperation('applied');
        } else if (!actorChanged && badge.clearAppBadge !== undefined) {
          await badge.clearAppBadge();
          reportAppBadgeOperation('cleared');
        }
      })
      .catch(ignoreBadgeFailure);
  }, [actorId, count]);
}

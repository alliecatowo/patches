/**
 * React glue for the web E2EE manager: binds the signed-in actor to the manager's
 * lifecycle and exposes its status (and vault access) as reactive hooks.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';

import { webE2ee, type WebE2eeStatus } from './web-e2ee.js';
import type { RatchetSessionVault } from './vault.js';
import type { EnrollmentTransport } from './enrollment.js';

/** Minimal actor shape the manager needs (satisfied by `useSession()`'s snapshot). */
export interface E2eeSessionActor {
  readonly actor: { readonly id: string } | null;
}

/**
 * Drives the E2EE manager with the signed-in actor (opening/closing the vault on
 * sign-in/out/switch) and subscribes this component to status transitions.
 */
export function useE2ee(session: E2eeSessionActor | null): WebE2eeStatus {
  const manager = webE2ee();
  const actorId = session?.actor?.id ?? null;
  useEffect(() => {
    void manager.setActor(actorId === null ? null : { id: actorId });
  }, [manager, actorId]);
  return useSyncExternalStore(
    (listener) => manager.subscribe(listener),
    () => manager.getStatus(),
    () => manager.getStatus(),
  );
}

export interface E2eeVaultAccess {
  /** The manager's own open vault handle — never a second IndexedDB connection to the
   * same account (ADR 0020 §4). `undefined` until acquired or while unavailable. */
  readonly vault: RatchetSessionVault | undefined;
  readonly actorId: string | undefined;
  readonly transport: EnrollmentTransport | undefined;
  readonly ready: boolean;
  /** `withVault` rejected (e.g. the manager lost its vault between `status` settling
   * and this hook's acquisition attempt). */
  readonly error: boolean;
}

const VAULT_OPEN_STATUSES: ReadonlySet<WebE2eeStatus['kind']> = new Set([
  'not-enrolled',
  'enrolled',
  'refused',
]);

/**
 * Hands device-link / recovery-archive UI the vault `status` implies the manager
 * currently holds open, via `WebE2eeManager.withVault` (issue #279) — never a second
 * `createRatchetSessionVault` connection to the same account. Callers still pass the
 * resolved `vault`/`actorId`/`transport` down as props to the panels that need them for
 * the lifetime of a flow (polling, etc.); this hook only owns the acquisition.
 */
export function useE2eeVaultAccess(status: WebE2eeStatus): E2eeVaultAccess {
  const manager = webE2ee();
  const [vault, setVault] = useState<RatchetSessionVault | undefined>(undefined);
  const [actorId, setActorId] = useState<string | undefined>(undefined);
  const [transport, setTransport] = useState<EnrollmentTransport | undefined>(undefined);
  const [error, setError] = useState(false);
  const isOpenStatus = VAULT_OPEN_STATUSES.has(status.kind);

  // Reset synchronously in render when `status` moves outside the vault-open set —
  // `manager.getStatus()` returns a stable reference until it actually transitions, so
  // this only fires on a genuine change, not every render. Adjusting state from a
  // changed prop belongs in render (React's documented pattern), not in the effect
  // below, which `react-hooks/set-state-in-effect` would otherwise flag as an
  // unconditioned synchronous `setState` call.
  const [lastStatus, setLastStatus] = useState(status);
  if (status !== lastStatus) {
    setLastStatus(status);
    if (!isOpenStatus) {
      setVault(undefined);
      setActorId(undefined);
      setTransport(undefined);
    }
  }

  useEffect(() => {
    if (!isOpenStatus) return undefined;
    let cancelled = false;
    manager
      .withVault((ctx) => Promise.resolve(ctx))
      .then((ctx) => {
        if (cancelled) return;
        setVault(ctx.vault);
        setActorId(ctx.actorId);
        setTransport(ctx.transport);
        setError(false);
      })
      .catch(() => {
        if (cancelled) return;
        setVault(undefined);
        setActorId(undefined);
        setTransport(undefined);
        setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [manager, status, isOpenStatus]);

  return { vault, actorId, transport, ready: vault !== undefined, error };
}

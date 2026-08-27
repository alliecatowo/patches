/**
 * Opens the dedicated vault connection the device-link / root-rotation / recovery-archive
 * UI needs (ADR 0037, issue #272). `apps/web/src/e2ee/web-e2ee.ts`'s `WebE2eeManager` keeps
 * its own vault handle private — there is no seam it exposes for reading or writing the
 * stored enrollment record from outside itself — so this hook opens a second connection to
 * the SAME account-scoped IndexedDB database via the same `createRatchetSessionVault` the
 * manager uses. IndexedDB allows more than one open connection to a database; this is not a
 * replacement for the manager's send/receive vault, only a way for settings-surface UI to
 * reach the enrollment record the manager itself would otherwise gate exclusively.
 *
 * After a link/rotation/import succeeds, callers must round-trip
 * `webE2ee().setActor(null)` then `webE2ee().setActor({ id: actorId })` (both public) so the
 * manager reloads the record this hook's vault just wrote — see `NeedsAuthorityFlow` and
 * `RecoveryArchivePanel`.
 */
import { useEffect, useState } from 'react';

import { api } from '../../api/client.js';
import { createWebEnrollmentTransport } from '../../e2ee/transports.js';
import { createRatchetSessionVault, type RatchetSessionVault } from '../../e2ee/vault.js';
import type { EnrollmentTransport } from '../../e2ee/enrollment.js';

export interface DeviceLinkVaultState {
  readonly vault: RatchetSessionVault | undefined;
  readonly transport: EnrollmentTransport;
  readonly ready: boolean;
  readonly error: boolean;
}

export function useDeviceLinkVault(actorId: string | undefined): DeviceLinkVaultState {
  const [vault, setVault] = useState<RatchetSessionVault | undefined>(undefined);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (actorId === undefined) return undefined;
    let cancelled = false;
    void createRatchetSessionVault({ account: { origin: location.origin, actorId } })
      .then((created) => {
        if (cancelled) {
          created.close();
          return;
        }
        setVault(created);
        setError(false);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      setVault((current) => {
        current?.close();
        return undefined;
      });
    };
  }, [actorId]);

  return {
    vault,
    transport: createWebEnrollmentTransport({ api }),
    ready: vault !== undefined,
    error,
  };
}

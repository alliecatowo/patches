import type { JSX } from 'react';

import { PendingLinkRequests } from '../../components/e2ee/PendingLinkRequests.js';
import { RecoveryArchivePanel } from '../../components/e2ee/RecoveryArchivePanel.js';
import { useE2ee, useE2eeVaultAccess } from '../../e2ee/use-e2ee.js';
import { useSession } from '../../hooks/useSession.js';
import styles from '../AuthForm.module.css';

/**
 * `/settings/devices` (ADR 0037, issues #265 #266 #272) — the authority-side half of device
 * linking (approve or discard a pending link offer) plus the optional recovery archive's
 * export/import actions. The new-device chooser (link / rotate / cancel) lives at the
 * enrollment call site instead (`MessagesRoute.tsx`'s `NeedsAuthorityFlow`) — this screen is
 * for a device that already holds the messaging identity root.
 *
 * Reads the manager's own vault via `useE2eeVaultAccess` (issue #279) rather than opening a
 * second `createRatchetSessionVault` connection to the same account — `useE2ee` binds this
 * screen to the manager's actor lifecycle exactly like `MessagesRoute`/`MessageThreadRoute`
 * do, and `setActor` is a no-op join when another mounted consumer already bound the same
 * actor's vault.
 */
export function DevicesRoute(): JSX.Element {
  const session = useSession();
  const status = useE2ee(session);
  const signedInActorId = session?.actor.id;
  const { vault, actorId, transport, ready, error } = useE2eeVaultAccess(status);

  return (
    <div className={styles['wrap']} style={{ margin: 0, maxWidth: 'none' }}>
      <h1>Devices &amp; recovery</h1>
      {signedInActorId === undefined ? <p>Sign in to manage devices.</p> : null}
      {error ? (
        <p role="alert">
          The encrypted message store in this browser could not be opened here either.
        </p>
      ) : null}
      {actorId !== undefined && ready && vault !== undefined && transport !== undefined ? (
        <>
          <PendingLinkRequests actorId={actorId} vault={vault} transport={transport} />
          <RecoveryArchivePanel actorId={actorId} vault={vault} transport={transport} />
        </>
      ) : null}
    </div>
  );
}

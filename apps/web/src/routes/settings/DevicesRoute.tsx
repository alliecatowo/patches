import type { JSX } from 'react';

import { useDeviceLinkVault } from '../../components/e2ee/useDeviceLinkVault.js';
import { PendingLinkRequests } from '../../components/e2ee/PendingLinkRequests.js';
import { RecoveryArchivePanel } from '../../components/e2ee/RecoveryArchivePanel.js';
import { useSession } from '../../hooks/useSession.js';
import styles from '../AuthForm.module.css';

/**
 * `/settings/devices` (ADR 0037, issues #265 #266 #272) — the authority-side half of device
 * linking (approve or discard a pending link offer) plus the optional recovery archive's
 * export/import actions. The new-device chooser (link / rotate / cancel) lives at the
 * enrollment call site instead (`MessagesRoute.tsx`'s `NeedsAuthorityFlow`) — this screen is
 * for a device that already holds the messaging identity root.
 */
export function DevicesRoute(): JSX.Element {
  const session = useSession();
  const actorId = session?.actor.id;
  const { vault, transport, ready, error } = useDeviceLinkVault(actorId);

  return (
    <div className={styles['wrap']} style={{ margin: 0, maxWidth: 'none' }}>
      <h1>Devices &amp; recovery</h1>
      {actorId === undefined ? <p>Sign in to manage devices.</p> : null}
      {error ? (
        <p role="alert">
          The encrypted message store in this browser could not be opened here either.
        </p>
      ) : null}
      {actorId !== undefined && ready && vault !== undefined ? (
        <>
          <PendingLinkRequests actorId={actorId} vault={vault} transport={transport} />
          <RecoveryArchivePanel actorId={actorId} vault={vault} transport={transport} />
        </>
      ) : null}
    </div>
  );
}

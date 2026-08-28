import type { JSX, ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { ChevronLeftIcon } from '../components/icons/Icons.js';
import { Avatar } from '../components/ui/index.js';
import styles from './ThreadHeader.module.css';

export interface ThreadHeaderProps {
  readonly name: string;
  readonly handle?: string | undefined;
  readonly avatarUrl?: string | undefined;
  /** Where the mobile back chevron goes; the chevron is hidden on the two-pane layout. */
  readonly backTo: string;
  /** `/messages/:id/safety` — offered only once there is a peer to verify against. */
  readonly safetyTo?: string | undefined;
  readonly statusChip?: ReactNode;
  readonly actions?: ReactNode;
}

/**
 * The thread pane's own header (#336): who you are talking to, and the one standing action
 * that belongs to the conversation rather than to the app — verifying the safety number.
 */
export function ThreadHeader({
  name,
  handle,
  avatarUrl,
  backTo,
  safetyTo,
  statusChip,
  actions,
}: ThreadHeaderProps): JSX.Element {
  return (
    <header className={styles['header']}>
      <Link to={backTo} className={styles['back']} aria-label="Back to conversations">
        <ChevronLeftIcon size={22} />
      </Link>
      <div className={styles['identity']}>
        <Avatar name={name} src={avatarUrl} size="md" />
        <div className={styles['names']}>
          <p className={styles['name']}>{name}</p>
          <span className={styles['subtitle']}>
            {handle === undefined ? null : <span>@{handle}</span>}
            {safetyTo === undefined ? null : (
              <Link to={safetyTo} className={styles['safetyLink']}>
                Verify safety number
              </Link>
            )}
          </span>
        </div>
      </div>
      {statusChip === undefined && actions === undefined ? null : (
        <div className={styles['actions']}>
          {statusChip}
          {actions}
        </div>
      )}
    </header>
  );
}

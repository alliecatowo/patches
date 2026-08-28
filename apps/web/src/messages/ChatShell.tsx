import type { JSX, ReactNode } from 'react';
import { Link } from 'react-router-dom';

import styles from './ChatShell.module.css';

export interface ChatShellProps {
  readonly list: ReactNode;
  readonly detail: ReactNode;
  /** Which pane is current on a stacked mobile/PWA layout (#321). `list` is the default —
   * every detail route (`/messages/:id`, `/messages/new`) passes `detail` with a back link. */
  readonly mobilePane: 'list' | 'detail';
  /** Shown as a header above the detail pane on mobile, with a back link to `/messages`. */
  readonly detailTitle?: string;
}

/**
 * #321: the chat app shell — two panes side by side at >=768px, stacked with back-navigation
 * below it. `MessagesRoute` renders `detail` as an empty-state placeholder; `/messages/:id`
 * and `/messages/new` render a thread or the people picker into the same slot.
 */
export function ChatShell({ list, detail, mobilePane, detailTitle }: ChatShellProps): JSX.Element {
  return (
    <div className={styles['shell']} data-mobile-pane={mobilePane}>
      <div className={styles['listPane']} role="list" aria-label="Conversations">
        {list}
      </div>
      <div className={styles['detailPane']}>
        {mobilePane === 'detail' ? (
          <div className={styles['backRow']}>
            <Link to="/messages" className={styles['backLink']} aria-label="Back to conversations">
              ← {detailTitle ?? 'Messages'}
            </Link>
          </div>
        ) : null}
        {detail}
      </div>
    </div>
  );
}

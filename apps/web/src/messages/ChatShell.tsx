import type { JSX, ReactNode } from 'react';

import styles from './ChatShell.module.css';

export interface ChatShellProps {
  readonly list: ReactNode;
  readonly detail: ReactNode;
  /** Which pane is current on a stacked mobile/PWA layout (#321). `list` is the default —
   * every detail route (`/messages/:id`, `/messages/new`) passes `detail`, and the detail
   * content owns its own back affordance via `ThreadHeader`. */
  readonly mobilePane: 'list' | 'detail';
  readonly title: string;
  /** A slim `StatusChip`, not a card: the standing E2EE/device state (#336). */
  readonly statusChip?: ReactNode;
  /** The single primary action for the surface — one compose control, not two. */
  readonly action?: ReactNode;
}

/**
 * #321/#336: the chat app shell — one header strip across the top, two panes side by side at
 * >=768px, stacked below it. The header is where the surface's title, standing status and
 * single primary action live, so no pane has to grow its own competing header.
 */
export function ChatShell({
  list,
  detail,
  mobilePane,
  title,
  statusChip,
  action,
}: ChatShellProps): JSX.Element {
  return (
    <div className={styles['shell']} data-mobile-pane={mobilePane}>
      <header className={styles['header']}>
        <h1 className={styles['title']}>{title}</h1>
        <div className={styles['status']}>{statusChip}</div>
        {action === undefined ? null : <div className={styles['action']}>{action}</div>}
      </header>
      <div className={styles['listPane']}>{list}</div>
      <div className={styles['detailPane']}>{detail}</div>
    </div>
  );
}

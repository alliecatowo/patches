import type { JSX, ReactNode } from 'react';

import { AlertTriangleIcon, ShieldIcon } from '../components/icons/Icons.js';
import styles from './ThreadNotice.module.css';

export interface ThreadNoticeProps {
  readonly tone?: 'info' | 'warning' | 'alert';
  readonly role?: 'note' | 'alert' | 'status';
  readonly children: ReactNode;
}

/**
 * One standing statement about the open thread, rendered as a slim strip under the header
 * (#336). The §183.1 disclosure is always one of these, so the treatment has to stay quiet
 * enough to live above every conversation without shouting.
 */
export function ThreadNotice({
  tone = 'info',
  role = 'note',
  children,
}: ThreadNoticeProps): JSX.Element {
  const Icon = tone === 'info' ? ShieldIcon : AlertTriangleIcon;
  return (
    <p className={`${styles['notice']} ${styles[tone]}`} role={role}>
      <Icon size={13} className={styles['icon']} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

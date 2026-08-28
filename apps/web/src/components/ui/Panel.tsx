import type { JSX, ReactNode } from 'react';

import styles from './Panel.module.css';

export interface PanelProps {
  readonly eyebrow?: string;
  readonly title?: string;
  readonly description?: ReactNode;
  readonly tone?: 'default' | 'alert';
  /** Centres the panel in its parent — the inline-in-a-pane placement. */
  readonly centered?: boolean;
  readonly children?: ReactNode;
  /** Actions, usually a `ButtonGroup`. */
  readonly footer?: ReactNode;
  readonly role?: string;
  readonly ariaLabel?: string;
}

/**
 * An inline panel (#336). Everything the messaging surface used to render as a floating card
 * — enrollment, needs-authority, device linking — is one of these, placed inside the pane it
 * belongs to.
 */
export function Panel({
  eyebrow,
  title,
  description,
  tone = 'default',
  centered = false,
  children,
  footer,
  role,
  ariaLabel,
}: PanelProps): JSX.Element {
  return (
    <div
      className={`${styles['panel']} ${tone === 'alert' ? styles['alert'] : ''} ${
        centered ? styles['centered'] : ''
      }`}
      role={role}
      aria-label={ariaLabel}
    >
      {eyebrow === undefined && title === undefined && description === undefined ? null : (
        <div className={styles['header']}>
          {eyebrow === undefined ? null : <span className={styles['eyebrow']}>{eyebrow}</span>}
          {title === undefined ? null : <h2 className={styles['title']}>{title}</h2>}
          {description === undefined ? null : (
            <p className={styles['description']}>{description}</p>
          )}
        </div>
      )}
      {children === undefined ? null : <div className={styles['body']}>{children}</div>}
      {footer === undefined ? null : <div className={styles['footer']}>{footer}</div>}
    </div>
  );
}

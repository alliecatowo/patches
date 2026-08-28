import type { JSX, ReactNode } from 'react';

import styles from './StatusChip.module.css';

export type StatusTone = 'neutral' | 'accent' | 'positive' | 'warning' | 'danger';

export interface StatusChipProps {
  readonly tone?: StatusTone;
  readonly icon?: ReactNode;
  readonly children: ReactNode;
  /** Full disclosure text when the chip's own label is an abbreviation of it. */
  readonly title?: string;
  readonly role?: 'note' | 'status' | 'alert';
}

/**
 * A slim status strip for a header (#336). Deliberately not a `Panel`: a standing condition
 * that never needs an action must not occupy a card floating above the layout.
 */
export function StatusChip({
  tone = 'neutral',
  icon,
  children,
  title,
  role,
}: StatusChipProps): JSX.Element {
  return (
    <span className={`${styles['chip']} ${styles[tone]}`} title={title} role={role}>
      {icon === undefined ? null : (
        <span className={styles['icon']} aria-hidden="true">
          {icon}
        </span>
      )}
      <span className={styles['label']}>{children}</span>
    </span>
  );
}

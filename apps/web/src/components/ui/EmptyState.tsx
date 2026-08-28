import type { JSX, ReactNode } from 'react';

import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  /** Decorative artwork — an `Illustration` or an `AvatarCluster`. */
  readonly illustration?: ReactNode;
  readonly title: string;
  readonly description?: ReactNode;
  /** A single primary action. More than one belongs in a `Panel`, not an empty state. */
  readonly action?: ReactNode;
  /** Tighter type and spacing, for a narrow pane. */
  readonly compact?: boolean;
  readonly role?: string;
}

/**
 * A designed empty state (#336): artwork, a title, one line of orientation, and at most one
 * action. Replaces the bare grey sentence that used to stand in for an empty pane.
 */
export function EmptyState({
  illustration,
  title,
  description,
  action,
  compact = false,
  role,
}: EmptyStateProps): JSX.Element {
  return (
    <div
      className={`${styles['emptyState']} ${compact ? styles['compact'] : ''}`}
      role={role}
      data-testid="empty-state"
    >
      {illustration === undefined ? null : (
        <div className={styles['illustration']}>{illustration}</div>
      )}
      <div className={styles['text']}>
        <p className={styles['title']}>{title}</p>
        {description === undefined ? null : <p className={styles['description']}>{description}</p>}
      </div>
      {action === undefined ? null : <div className={styles['action']}>{action}</div>}
    </div>
  );
}

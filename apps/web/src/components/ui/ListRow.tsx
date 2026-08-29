import type { JSX, ReactNode } from 'react';
import { Link } from 'react-router-dom';

import styles from './ListRow.module.css';

export interface ListRowProps {
  /** Renders as a router `Link`. Mutually exclusive with `onClick`. */
  readonly to?: string;
  readonly onClick?: () => void;
  readonly active?: boolean;
  /** Bolder title/meta — the unread treatment. */
  readonly emphasised?: boolean;
  readonly leading?: ReactNode;
  readonly title: ReactNode;
  readonly subtitle?: ReactNode;
  /** Right-aligned on the title line: a timestamp, usually. */
  readonly meta?: ReactNode;
  /** Right-aligned on the subtitle line: an unread dot, a chip. */
  readonly trailing?: ReactNode;
  readonly ariaLabel?: string;
}

/**
 * The one two-line row (#336): avatar/leading slot, title + meta, subtitle + trailing. Used
 * by the conversation list and the people picker so both read as the same component set.
 */
export function ListRow({
  to,
  onClick,
  active = false,
  emphasised = false,
  leading,
  title,
  subtitle,
  meta,
  trailing,
  ariaLabel,
}: ListRowProps): JSX.Element {
  const className = [
    styles['row'],
    active ? styles['active'] : '',
    emphasised ? styles['emphasised'] : '',
    to === undefined && onClick === undefined ? styles['static'] : '',
  ]
    .filter((name) => name !== '')
    .join(' ');

  const content = (
    <>
      {leading === undefined ? null : <span className={styles['leading']}>{leading}</span>}
      <span className={styles['body']}>
        <span className={styles['topLine']}>
          <span className={styles['title']}>{title}</span>
          {meta === undefined ? null : <span className={styles['meta']}>{meta}</span>}
        </span>
        {subtitle === undefined && trailing === undefined ? null : (
          <span className={styles['bottomLine']}>
            <span className={styles['subtitle']}>{subtitle}</span>
            {trailing === undefined ? null : <span className={styles['trailing']}>{trailing}</span>}
          </span>
        )}
      </span>
    </>
  );

  if (to !== undefined) {
    return (
      <Link to={to} className={className} aria-label={ariaLabel}>
        {content}
      </Link>
    );
  }
  if (onClick !== undefined) {
    return (
      <button type="button" className={className} onClick={onClick} aria-label={ariaLabel}>
        {content}
      </button>
    );
  }
  return (
    <div className={className} aria-label={ariaLabel}>
      {content}
    </div>
  );
}

/** The unread marker for a `ListRow`'s trailing slot; the count stays in the accessible name. */
export function UnreadDot({ count }: { readonly count: number }): JSX.Element {
  return <span className={styles['unreadDot']} role="status" aria-label={`${count} unread`} />;
}

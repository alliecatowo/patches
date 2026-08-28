import type { CSSProperties, JSX } from 'react';

import styles from './Skeleton.module.css';

export type SkeletonVariant = 'text' | 'circle' | 'rect';

export interface SkeletonProps {
  readonly variant?: SkeletonVariant;
  /** CSS length (`'40px'`, `'60%'`) — `circle` reuses it for both dimensions. */
  readonly width?: string;
  readonly height?: string;
}

/**
 * A loading placeholder (#325). Shimmers under normal motion; under
 * `prefers-reduced-motion: reduce` it falls back to a static tint rather than the animation
 * (the same switch `tokens.css`'s `--motion-*` variables use, kept local since a shimmer
 * keyframe isn't itself duration-token-driven).
 */
export function Skeleton({ variant = 'text', width, height }: SkeletonProps): JSX.Element {
  const style: CSSProperties = {};
  if (width !== undefined) style.width = width;
  if (height !== undefined) style.height = variant === 'circle' ? width : height;

  return (
    <span className={`${styles['skeleton']} ${styles[variant]}`} style={style} aria-hidden="true" />
  );
}

export interface SkeletonRowProps {
  readonly withAvatar?: boolean;
  readonly lines?: number;
}

/** The two/three-line row shape shared by conversation lists, timelines, and people pickers —
 * an avatar circle plus a title-width line and one or two shorter lines beneath it. */
export function SkeletonRow({ withAvatar = true, lines = 2 }: SkeletonRowProps): JSX.Element {
  const widths: readonly string[] = ['70%', '45%', '55%'];
  return (
    <div className={styles['row']}>
      {withAvatar ? <Skeleton variant="circle" width="40px" /> : null}
      <div className={styles['rowLines']}>
        {Array.from({ length: lines }, (_, index) => (
          <Skeleton key={index} variant="text" width={widths[index % widths.length] ?? '60%'} />
        ))}
      </div>
    </div>
  );
}

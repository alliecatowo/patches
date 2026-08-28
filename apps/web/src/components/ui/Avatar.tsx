import type { CSSProperties, JSX, ReactNode } from 'react';

import styles from './Avatar.module.css';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface AvatarProps {
  /** Display name or handle. Drives the initials and the fallback hue. */
  readonly name: string;
  /** A resolved image URL (#335 avatars come off `actor.avatar.url`). */
  readonly src?: string | undefined;
  readonly size?: AvatarSize;
  /** Defaults to empty — an avatar next to its own name is decorative, so it stays out of
   * the accessibility tree unless the caller says it carries meaning on its own. */
  readonly alt?: string;
}

/** Up to two initials, ignoring a leading `@` and any non-letter noise in the handle. */
export function initialsFor(name: string): string {
  const words = name
    .replace(/^@/, '')
    .split(/[\s._-]+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((word) => word.length > 0);
  if (words.length === 0) return '?';
  if (words.length === 1) return (words[0] ?? '').slice(0, 2).toUpperCase();
  return `${(words[0] ?? '').slice(0, 1)}${(words[1] ?? '').slice(0, 1)}`.toUpperCase();
}

/** Stable per-name hue. FNV-1a over the code points, so it never depends on locale. */
export function hueFor(name: string): number {
  let hash = 0x811c9dc5;
  for (const char of name) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 360;
}

/**
 * The actor avatar (#336). Renders the real image when there is one and a deterministic
 * initials tile when there is not — a messaging surface without avatars reads as scaffolding,
 * and a missing avatar must not degrade a row to a grey square.
 */
export function Avatar({ name, src, size = 'md', alt = '' }: AvatarProps): JSX.Element {
  const style: CSSProperties & Record<'--avatar-hue', string> = {
    '--avatar-hue': `${hueFor(name)}`,
  };
  return (
    <span
      className={`${styles['avatar']} ${styles[size]}`}
      style={style}
      data-testid="avatar"
      aria-hidden={alt === '' ? true : undefined}
    >
      {src === undefined || src === '' ? (
        <span className={styles['initials']}>{initialsFor(name)}</span>
      ) : (
        <img className={styles['image']} src={src} alt={alt} loading="lazy" />
      )}
    </span>
  );
}

export interface AvatarClusterProps {
  readonly children: ReactNode;
}

/** Overlapping avatars, used as the empty-state illustration and for group threads. */
export function AvatarCluster({ children }: AvatarClusterProps): JSX.Element {
  return (
    <span className={styles['cluster']} aria-hidden="true">
      {children}
    </span>
  );
}

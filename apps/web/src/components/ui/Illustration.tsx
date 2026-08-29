import type { JSX } from 'react';

/**
 * Decorative line illustrations for empty states (#336). Inline SVG rather than an asset:
 * they are two-colour, they must follow the active theme's `--accent`/`--fg` at runtime, and
 * an empty state that waits on a network round-trip for its own artwork is worse than none.
 * All are `aria-hidden` — the `EmptyState` title and description carry the meaning.
 */

export interface IllustrationProps {
  readonly size?: number;
}

/** Two conversation bubbles — the "no conversations yet" state. */
export function ConversationsIllustration({ size = 112 }: IllustrationProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 112 112"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="56" cy="56" r="54" fill="var(--accent-soft)" />
      <rect
        x="18"
        y="30"
        width="58"
        height="38"
        rx="12"
        fill="var(--surface)"
        stroke="var(--accent)"
        strokeWidth="2.5"
      />
      <path
        d="M32 48h30M32 57h20"
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M30 68v10l12-10"
        fill="var(--surface)"
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <rect
        x="52"
        y="52"
        width="42"
        height="30"
        rx="10"
        fill="var(--surface-raised)"
        stroke="var(--text-tertiary)"
        strokeWidth="2.5"
      />
      <path
        d="M62 64h22M62 72h14"
        stroke="var(--text-tertiary)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** A cursor over an open pane — the "pick a conversation" detail-pane state. */
export function SelectConversationIllustration({ size = 128 }: IllustrationProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="64" cy="64" r="60" fill="var(--accent-soft)" />
      <rect
        x="22"
        y="34"
        width="84"
        height="60"
        rx="14"
        fill="var(--surface)"
        stroke="var(--accent)"
        strokeWidth="2.5"
      />
      <path d="M52 34v60" stroke="var(--accent)" strokeWidth="2.5" opacity="0.45" />
      <circle cx="37" cy="50" r="5" fill="var(--accent)" opacity="0.5" />
      <circle cx="37" cy="66" r="5" fill="var(--accent)" opacity="0.3" />
      <circle cx="37" cy="82" r="5" fill="var(--accent)" opacity="0.3" />
      <rect x="64" y="48" width="30" height="9" rx="4.5" fill="var(--accent)" opacity="0.35" />
      <rect x="64" y="63" width="20" height="9" rx="4.5" fill="var(--accent)" opacity="0.2" />
      <path
        d="M84 76l18 18-7 2 4 9-4 2-4-9-6 4z"
        fill="var(--surface)"
        stroke="var(--text-primary)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A key over a device — the needs-authority / device-linking panels. */
export function DeviceKeyIllustration({ size = 96 }: IllustrationProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="48" cy="48" r="46" fill="var(--accent-soft)" />
      <rect
        x="24"
        y="22"
        width="34"
        height="52"
        rx="8"
        fill="var(--surface)"
        stroke="var(--accent)"
        strokeWidth="2.5"
      />
      <path d="M35 66h12" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
      <circle
        cx="64"
        cy="44"
        r="10"
        fill="var(--surface)"
        stroke="var(--text-primary)"
        strokeWidth="2.5"
      />
      <path
        d="M71 51l12 12M77 57l-4 4M83 63l-4 4"
        stroke="var(--text-primary)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

import type { JSX } from 'react';

/**
 * Mandatory DM disclosure (Amendment B §183.1): v0 direct messages are
 * server-visible, never end-to-end encrypted, and every client must say so
 * — this exact copy must never call DMs "encrypted", "secure", or "private".
 */
export function DmNotice(): JSX.Element {
  return (
    <p
      role="note"
      style={{ color: 'var(--fg-muted)', fontSize: '0.85rem', padding: '0.5rem 1rem' }}
    >
      Not end-to-end encrypted — this node&apos;s operators can read these messages.
    </p>
  );
}

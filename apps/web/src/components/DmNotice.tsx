import type { JSX } from 'react';

import { ConversationSecurityMode } from '@patches/proto/es';

/** Wire `security_mode` of a conversation (ADR 0020 §11: read from the wire, never assumed). */
export type ConversationSecurityModeValue = ConversationSecurityMode | undefined;

/**
 * Short mode label for surfaces where the API exposes `security_mode`
 * (conversation list rows, thread header). Worded to match the TUI's labels;
 * the full disclosure lives in {@link dmNoticeCopy}, never in the label.
 */
export function securityModeLabel(
  securityMode: ConversationSecurityModeValue,
): 'E2EE' | 'Server-visible' | undefined {
  if (securityMode === ConversationSecurityMode.E2EE_V1) return 'E2EE';
  if (securityMode === ConversationSecurityMode.LEGACY_SERVER_VISIBLE) return 'Server-visible';
  return undefined;
}

/**
 * Disclosure copy for a DM surface, keyed by the conversation's wire
 * `security_mode` — never by a local assumption about which screen is rendered.
 *
 * - `E2EE_V1`: §194 permits "end-to-end encrypted" for this mode and only this
 *   mode. The web app has no crypto runtime, so it must also say plainly that
 *   it cannot decrypt these conversations.
 * - `LEGACY_SERVER_VISIBLE`: the exact sentence Amendment B §183.1 mandates,
 *   unchanged until B-095 removes the mode.
 * - No conversation context (list route, fetch still pending): neither claim is
 *   asserted; both possibilities are stated neutrally instead.
 */
export function dmNoticeCopy(securityMode: ConversationSecurityModeValue): string {
  if (securityMode === ConversationSecurityMode.E2EE_V1) {
    return "End-to-end encrypted. DMs live in the terminal client — this web view can't decrypt them.";
  }
  if (securityMode === ConversationSecurityMode.LEGACY_SERVER_VISIBLE) {
    return "Not end-to-end encrypted — this node's operators can read these messages.";
  }
  return 'Conversations are labeled with their security mode: end-to-end encrypted ones open in the terminal client; server-visible ones can be read by this node\u2019s operators.';
}

/**
 * Mandatory per-mode DM disclosure. The copy is derived from the conversation's
 * wire `security_mode` (ADR 0020 §11) so a surface can never assert the wrong
 * fact about the messages it shows.
 */
export function DmNotice({
  securityMode,
}: {
  securityMode?: ConversationSecurityModeValue;
}): JSX.Element {
  return (
    <p
      role="note"
      style={{ color: 'var(--fg-muted)', fontSize: '0.85rem', padding: '0.5rem 1rem' }}
    >
      {dmNoticeCopy(securityMode)}
    </p>
  );
}

import type { JSX } from 'react';

import { ConversationSecurityMode } from '@patches/proto/es';
import { mayDescribeAsEndToEndEncrypted, requiredConversationDisclosure } from '@patches/domain';

/** Wire `security_mode` of a conversation (ADR 0020 §11: read from the wire, never assumed). */
export type ConversationSecurityModeValue = ConversationSecurityMode | undefined;

/**
 * Short mode label for surfaces where the API exposes `security_mode`
 * (conversation list rows, thread header).
 */
export function securityModeLabel(securityMode: ConversationSecurityModeValue): 'E2EE' | undefined {
  if (securityMode === ConversationSecurityMode.E2EE_V1) return 'E2EE';
  return undefined;
}

/**
 * Disclosure copy for a DM surface, keyed by the conversation's wire `security_mode` —
 * never by a local assumption about which screen is rendered.
 *
 * B-095/B-096 (ADR 0030) retired `LEGACY_SERVER_VISIBLE`: every conversation this web
 * client can still reach is `E2EE_V1`. It has no crypto runtime of its own, so on top of
 * `@patches/domain`'s shared disclosure it also says plainly that it can't decrypt these
 * conversations — that fact is specific to this client, not part of the mode's contract.
 */
export function dmNoticeCopy(securityMode: ConversationSecurityModeValue): string {
  if (securityMode === ConversationSecurityMode.E2EE_V1) {
    return `${requiredConversationDisclosure('E2EE_V1')} This web view has no key material to decrypt them — open the terminal client to read or send.`;
  }
  // No conversation context yet (list route, fetch still pending): every real
  // conversation is E2EE_V1, but nothing here has confirmed that for *this* one, so the
  // wording stays generic rather than asserting a fact not yet read off the wire.
  return mayDescribeAsEndToEndEncrypted('E2EE_V1')
    ? 'Direct messages are end-to-end encrypted and open in the terminal client, which holds the decryption keys this web view does not.'
    : '';
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

import { ConversationSecurityMode } from '@patches/proto/es';

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

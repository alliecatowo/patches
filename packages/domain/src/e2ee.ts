/** Public, immutable conversation modes. Existing rows may never transition between them. */
export const CONVERSATION_SECURITY_MODES = ['LEGACY_SERVER_VISIBLE', 'E2EE_V1'] as const;
export type ConversationSecurityMode = (typeof CONVERSATION_SECURITY_MODES)[number];

/** Operator rollout state. Only post-review states may be used outside isolated test nodes. */
export const E2EE_CAPABILITY_STATES = [
  'DISABLED',
  'ISOLATED_TEST_ONLY',
  'EXTERNAL_REVIEW_PENDING',
  'EXPERIMENTAL_CANARY',
  'ENABLED',
] as const;
export type E2eeCapabilityState = (typeof E2EE_CAPABILITY_STATES)[number];

export const E2EE_PROTOCOL_V1 = 'patches-e2ee-v1' as const;
export const E2EE_GROUP_MAX_MEMBERS = 8;
export const E2EE_MAX_ACTIVE_DEVICES_PER_ACTOR = 8;
export const E2EE_MAX_DEVICE_ENVELOPES_PER_LOGICAL_MESSAGE =
  E2EE_GROUP_MAX_MEMBERS * E2EE_MAX_ACTIVE_DEVICES_PER_ACTOR;
export const E2EE_ONE_TIME_PREKEY_TARGET = 100;
export const E2EE_SIGNED_PREKEY_ROTATION_MS = 7 * 24 * 60 * 60 * 1_000;
export const E2EE_REPORT_MAX_SURROUNDING_MESSAGES = 10;
export const E2EE_MAX_ENVELOPE_BYTES = 64 * 1_024;

export class E2eeContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'E2eeContractError';
  }
}

export interface E2eeModeNegotiation {
  readonly requestedMode: ConversationSecurityMode;
  readonly capabilityState: E2eeCapabilityState;
  readonly isolatedTestNode: boolean;
  readonly participantProtocols: readonly (typeof E2EE_PROTOCOL_V1 | null)[];
}

export function assertImmutableConversationMode(
  persisted: ConversationSecurityMode,
  requested: ConversationSecurityMode,
): void {
  if (persisted !== requested) {
    throw new E2eeContractError('Conversation security mode is immutable.');
  }
}

/**
 * Enforce capability negotiation without an E2EE-to-plaintext fallback. A caller may retry only
 * after capabilities/devices change, or deliberately create a separate legacy conversation.
 */
export function assertConversationModeNegotiation(input: E2eeModeNegotiation): void {
  if (input.requestedMode === 'LEGACY_SERVER_VISIBLE') return;
  const allowed =
    input.capabilityState === 'EXPERIMENTAL_CANARY' ||
    input.capabilityState === 'ENABLED' ||
    (input.isolatedTestNode && input.capabilityState === 'ISOLATED_TEST_ONLY');
  if (!allowed) {
    throw new E2eeContractError('E2EE_V1 is not enabled on this node.');
  }
  if (
    input.participantProtocols.length < 2 ||
    input.participantProtocols.some((protocol) => protocol !== E2EE_PROTOCOL_V1)
  ) {
    throw new E2eeContractError('Every participant device must support E2EE_V1.');
  }
}

export function assertE2eeGroupBounds(memberCount: number, envelopeCount: number): void {
  if (!Number.isInteger(memberCount) || memberCount < 2 || memberCount > E2EE_GROUP_MAX_MEMBERS) {
    throw new E2eeContractError('E2EE group membership is outside the supported bound.');
  }
  if (
    !Number.isInteger(envelopeCount) ||
    envelopeCount < memberCount ||
    envelopeCount > E2EE_MAX_DEVICE_ENVELOPES_PER_LOGICAL_MESSAGE
  ) {
    throw new E2eeContractError('E2EE device fanout is outside the supported bound.');
  }
}

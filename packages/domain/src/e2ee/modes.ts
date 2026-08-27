/** Public, immutable conversation modes. Existing rows may never transition between them. */
export const CONVERSATION_SECURITY_MODES = ['LEGACY_SERVER_VISIBLE', 'E2EE_V1'] as const;
export type ConversationSecurityMode = (typeof CONVERSATION_SECURITY_MODES)[number];

/**
 * Operator rollout state. Owner override (2026-08-26, ADR 0036 Amendment, see the ADR's
 * top-of-file note): E2EE is an always-on feature, so a node only ever reports `DISABLED` or
 * `ENABLED` in practice. `ISOLATED_TEST_ONLY` and `EXPERIMENTAL_CANARY` remain defined so their
 * protobuf enum numbers are never reused (spec §153) and so a future unreviewed protocol change
 * (a v2 franking profile, a v2 transcript family) has an honest state to run in, but nothing in
 * this codebase produces them anymore.
 */
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

/**
 * One-time prekey count at which a device replenishes its server inventory (ADR 0020 §5).
 * A protocol constant, not node configuration: a remote node must not be able to move it.
 */
export const E2EE_ONE_TIME_PREKEY_REPLENISH_THRESHOLD = 20;

/**
 * How long a device mailbox holds an undelivered envelope, and therefore how long a superseded
 * signed-prekey private key must be retained (ADR 0020 §5's `MAXLATENCY`). A device offline
 * beyond this window rejoins with fresh sessions rather than old prekey state.
 */
export const E2EE_MAILBOX_MAX_LATENCY_MS = 30 * 24 * 60 * 60 * 1_000;

/** Device certificate format version this contract describes (ADR 0020 §2). */
export const E2EE_DEVICE_CERTIFICATE_VERSION = 1;

/**
 * Identifier of the v1 message-franking construction (ADR 0020 §9).
 *
 * The *name* is fixed so evidence carries a versioned profile from the first byte written.
 */
export const E2EE_FRANKING_PROFILE_V1 = 'patches-franking-v1' as const;

/**
 * Franking profiles this node may use for production conversations.
 *
 * Owner override (2026-08-26, ADR 0036 Amendment): the reference node is pre-alpha, invite-only,
 * with no real conversations, so the staged independent-review gate ADR 0020 §12.7 described for
 * a rollout to real users does not apply. `E2EE_FRANKING_PROFILE_V1` is the shipped profile and
 * is approved here. Adding a *second* profile (a v2 construction) still requires amending an ADR
 * — not editing this constant in a feature branch — this list is the sole production authority
 * (an environment override may only narrow it, never widen it; see `apps/server/src/config/
 * env.schema.ts`).
 */
export const E2EE_APPROVED_FRANKING_PROFILES: readonly string[] = Object.freeze([
  E2EE_FRANKING_PROFILE_V1,
]);

/**
 * Gate for enabling a franking profile. Throws unless the profile is in
 * {@link E2EE_APPROVED_FRANKING_PROFILES}.
 */
export function assertFrankingProfileApproved(profile: string): void {
  if (!E2EE_APPROVED_FRANKING_PROFILES.includes(profile)) {
    throw new E2eeContractError(
      `Franking profile "${profile}" has not passed ADR 0020 §12.7 independent review.`,
    );
  }
}

/**
 * Per-device capability check (ADR 0020 §1.2, §11). One device that does not implement the
 * protocol makes the send fail; it never downgrades the conversation, and it never causes a
 * partial fanout that silently excludes that device.
 */
export function assertDeviceSupportsProtocol(
  supportedProtocolVersions: readonly string[],
  required: string = E2EE_PROTOCOL_V1,
): void {
  if (!supportedProtocolVersions.includes(required)) {
    throw new E2eeContractError(`Device does not support ${required}; the send must fail.`);
  }
}

/**
 * Whether a client may use the words "encrypted", "end-to-end", or "secure" for a conversation.
 *
 * Spec §194 forbids them for anything but `E2EE_V1`, and spec §183.1 requires the legacy screen
 * to say plainly that the node's operators can read the messages. This function exists so that
 * rule is one call rather than a condition every client re-derives (and eventually gets wrong).
 */
export function mayDescribeAsEndToEndEncrypted(mode: ConversationSecurityMode): boolean {
  return mode === 'E2EE_V1';
}

/**
 * The disclosure a client MUST render for a conversation, per spec §183.1/§194 and ADR 0020 §8.
 *
 * Returned as text rather than a boolean because both modes have something the user has to be
 * told: legacy is readable by the operator, and E2EE still exposes routing metadata. Neither may
 * be shortened to "private".
 */
export function requiredConversationDisclosure(mode: ConversationSecurityMode): string {
  return mode === 'E2EE_V1'
    ? 'End-to-end encrypted. This node cannot read these messages, but it can see who you message and when.'
    : "Not end-to-end encrypted — this node's operators can read these messages.";
}

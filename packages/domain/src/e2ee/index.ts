/**
 * The E2EE DM domain contract (ADR 0020, spec §183/§194/§195.1; task P13-001).
 *
 * This barrel is the authoritative public surface. Everything in it is pure, synchronous, and
 * free of crypto dependencies: signatures, digests, and franking checks are injected interfaces
 * (`SignatureVerifier`, `DigestFunction`, `FrankingVerifier`) that `@patches/crypto` implements
 * and tests fake. That is what lets the TUI, the server, and the worker all run *the same*
 * validators — a rule enforced in one place is a rule; a rule re-derived in three clients is
 * three chances to get it wrong.
 *
 * Nothing here is wired up. `E2eeService` is schema-only and `GetE2eeCapability` reports
 * `DISABLED` on the reference node until ADR 0020 §12's ship gates — including independent
 * cryptographic review of the franking construction — are complete.
 */

export {
  assertConversationModeNegotiation,
  assertDeviceSupportsProtocol,
  assertE2eeGroupBounds,
  assertFrankingProfileApproved,
  assertImmutableConversationMode,
  CONVERSATION_SECURITY_MODES,
  E2EE_APPROVED_FRANKING_PROFILES,
  E2EE_CAPABILITY_STATES,
  E2EE_DEVICE_CERTIFICATE_VERSION,
  E2EE_FRANKING_PROFILE_V1,
  E2EE_GROUP_MAX_MEMBERS,
  E2EE_MAILBOX_MAX_LATENCY_MS,
  E2EE_MAX_ACTIVE_DEVICES_PER_ACTOR,
  E2EE_MAX_DEVICE_ENVELOPES_PER_LOGICAL_MESSAGE,
  E2EE_MAX_ENVELOPE_BYTES,
  E2EE_ONE_TIME_PREKEY_REPLENISH_THRESHOLD,
  E2EE_ONE_TIME_PREKEY_TARGET,
  E2EE_PROTOCOL_V1,
  E2EE_REPORT_MAX_SURROUNDING_MESSAGES,
  E2EE_SIGNED_PREKEY_ROTATION_MS,
  E2eeContractError,
  mayDescribeAsEndToEndEncrypted,
  requiredConversationDisclosure,
} from './modes.js';
export type {
  ConversationSecurityMode,
  E2eeCapabilityState,
  E2eeModeNegotiation,
} from './modes.js';

export {
  bytesEqual,
  E2EE_DIGEST_BYTES,
  ED25519_PUBLIC_KEY_BYTES,
  ED25519_SIGNATURE_BYTES,
  isZeroBytes,
  X25519_PUBLIC_KEY_BYTES,
} from './types.js';
export type { Bytes, DigestFunction, SignatureVerifier } from './types.js';

export {
  assertDeviceUsableForSend,
  classifyIdentityRootChange,
  E2EE_DEVICE_STATUSES,
  E2EE_IDENTITY_CHANGES,
  requiresReverification,
  verifyDeviceCertificate,
  verifyIdentityRoot,
} from './certificates.js';
export type {
  E2eeDeviceCertificateView,
  E2eeDeviceStatus,
  E2eeIdentityChange,
  E2eeIdentityRootView,
} from './certificates.js';

export {
  assertGroupControlChain,
  assertGroupControlShape,
  assertGroupControlSucceeds,
  assertGroupSizeWithinBound,
  canonicalGroupControlTranscript,
  E2EE_GROUP_CHANGE_KINDS,
  E2EE_GROUP_CONTROL_TRANSCRIPT_DOMAIN,
  groupControlGenesisPreviousDigest,
  groupControlGenesisTip,
  verifyGroupControlSignature,
} from './groups.js';
export type {
  E2eeGroupChangeKind,
  E2eeGroupControlChainTip,
  E2eeGroupControlEventFields,
  E2eeGroupControlEventView,
} from './groups.js';

export {
  activeDeviceIds,
  assertRosterChain,
  assertRosterNotRolledBack,
  assertRosterShape,
  assertRosterSucceeds,
  rosterGenesisPreviousDigest,
  verifyRosterSignature,
} from './roster.js';
export type { E2eeDeviceRosterView, E2eeRosterEntryView } from './roster.js';

export {
  assertControlEnvelopeDigest,
  assertControlEnvelopeShape,
  canonicalControlEnvelopeBytes,
  decodeControlEnvelope,
  encodeControlEnvelope,
  E2EE_CONTROL_ENVELOPE_DOMAIN,
  E2EE_CONTROL_ENVELOPE_VERSION,
  E2EE_CONTROL_MAX_BYTES,
  E2EE_CONTROL_MAX_EDIT_PLAINTEXT_BYTES,
  E2EE_CONTROL_MAX_READ_RECEIPT_IDS,
  E2EE_CONTROL_TYPING_TTL_MS,
  E2EE_CONTROL_TYPES,
} from './control.js';
export type {
  E2eeControlEnvelope,
  E2eeControlEnvelopeView,
  E2eeControlType,
  E2eeDeleteControl,
  E2eeEditControl,
  E2eeReadReceiptControl,
  E2eeTypingControl,
} from './control.js';

export {
  assertGroupMembershipBounds,
  assertMembershipChain,
  assertMembershipEventShape,
  assertMembershipSucceeds,
  membershipGenesisPreviousDigest,
  verifyMembershipEventSignature,
} from './membership.js';
export type { E2eeMembershipAction, E2eeMembershipEventView } from './membership.js';

export {
  assertCiphertextDigestsMatchCiphertexts,
  assertEnvelopeShape,
  assertFanoutCovers,
  assertFanoutDigest,
  assertGroupFanoutBounds,
  assertMailboxPageOrdering,
  assertMembershipEpochCurrent,
  canonicalFanoutTranscript,
  compareMailboxKeys,
  E2EE_FANOUT_TRANSCRIPT_DOMAIN,
  sortFanoutTargets,
} from './envelopes.js';
export type {
  E2eeDeviceEnvelopeView,
  E2eeFanoutTarget,
  E2eeFanoutTranscriptInput,
  E2eeLogicalMessageView,
  E2eeMailboxKey,
} from './envelopes.js';

export {
  assertHistoryEntryFields,
  assertHistoryTransferDigest,
  assertHistoryTransferShape,
  canonicalHistoryTransferTranscript,
  decodeHistoryTransfer,
  encodeHistoryTransfer,
  E2EE_HISTORY_TRANSFER_DOMAIN,
  E2EE_HISTORY_TRANSFER_MAX_ENTRIES,
  E2EE_HISTORY_TRANSFER_MAX_ENTRY_BYTES,
  E2EE_HISTORY_TRANSFER_MAX_RECORD_BYTES,
  E2EE_HISTORY_TRANSFER_VERSION,
} from './history-transfer.js';
export type {
  E2eeHistoryEntryFields,
  E2eeHistoryTransferFields,
  E2eeHistoryTransferView,
} from './history-transfer.js';

export {
  assertRecoveryArchiveShape,
  assertRestoredDeviceCertificateIsFresh,
  assertServedRosterAcceptsRestore,
  canonicalRecoveryArchiveTranscript,
  decodeRecoveryArchiveDocument,
  decodeRecoveryCode,
  encodeRecoveryArchiveDocument,
  encodeRecoveryCode,
  E2EE_RECOVERY_ARCHIVE_CONTAINER_MAGIC,
  E2EE_RECOVERY_ARCHIVE_CONTAINER_VERSION,
  E2EE_RECOVERY_ARCHIVE_DOMAIN,
  E2EE_RECOVERY_ARCHIVE_HEADER_BYTES,
  E2EE_RECOVERY_ARCHIVE_KDF_INFO,
  E2EE_RECOVERY_ARCHIVE_NONCE_BYTES,
  E2EE_RECOVERY_ARCHIVE_SALT_BYTES,
  E2EE_RECOVERY_ARCHIVE_VERSION,
  E2EE_RECOVERY_KEY_BYTES,
  E2EE_RECOVERY_MAX_CONVERSATIONS,
  E2EE_RECOVERY_MAX_HISTORY_ENTRIES,
  E2EE_RECOVERY_MAX_SETTINGS_BYTES,
  groupRecoveryCodeForDisplay,
  planRecoveryRestore,
  recoveryCodeChecksumByte,
} from './recovery.js';
export type {
  E2eeRecoveryArchiveDocument,
  E2eeRecoveryArchiveView,
  E2eeRecoveryConversationEntry,
  E2eeRecoveryRestorePlan,
} from './recovery.js';

export {
  assertReporterConsent,
  assertReportEvidenceShape,
  E2EE_EVIDENCE_FAILURE_CODES,
  E2EE_EVIDENCE_VERIFICATION_STATUSES,
  E2EE_FRANKING_MODERATOR_DISCLOSURE,
  E2EE_REPORT_MAX_EVIDENCE_ITEMS,
  verifyReportEvidence,
} from './franking.js';
export type {
  E2eeEvidenceFailureCode,
  E2eeEvidenceVerification,
  E2eeEvidenceVerificationStatus,
  E2eeFrankingCommitmentContext,
  E2eeFrankingTagView,
  E2eeReportEvidenceItemView,
  FrankingVerifier,
} from './franking.js';

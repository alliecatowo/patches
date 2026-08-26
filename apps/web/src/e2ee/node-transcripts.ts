/**
 * Client-side writers for the node's canonical identity transcripts (ADR 0020 §2) —
 * web port of the TUI module, field-for-field identical encoders (the bytes are the
 * wire contract with the node, so any divergence is an interop bug).
 *
 * `certificate_bytes` / `roster_bytes` are the authoritative content every signature
 * covers, and the concrete encoding is owned today by the node's codec
 * (`apps/server/src/modules/e2ee/e2ee.codec.ts`). The *writer* half (the enrollment flow
 * needs to produce these bytes for its own certificate/roster/prekey-bundle signatures)
 * lives here, pinned to the server's layout by construction.
 *
 * B-188 removed this module's *reader* half (`decodeCertificateTranscript`,
 * `decodeRosterTranscript`, `wireCertificateMatchesTranscript`,
 * `wireRosterMatchesTranscript`): verifying a *peer's* device certificate/roster against
 * these node-canonical bytes was unreachable dead code — `transports.ts`'s
 * `claimPrekeyBundles` fails closed before any peer material is ever fetched (B-124), so
 * nothing ever called them. Unlike the writer half (exercised on every enrollment), an
 * uncalled verifier only rots silently against the server codec instead of failing a
 * test. If that peer-verification capability becomes reachable again (B-124 lands), the
 * reader belongs back here re-derived from the current server codec, not resurrected
 * from history.
 */
import { ByteWriter, KEY_BYTES } from '@patches/crypto';
import type { Bytes } from '@patches/domain';

/** Same constant as the server codec's `CERTIFICATE_TRANSCRIPT_DOMAIN`. */
const CERTIFICATE_TRANSCRIPT_DOMAIN = 'patches-e2ee-v1/node-device-cert';
/** Same constant as the server codec's `ROSTER_TRANSCRIPT_DOMAIN`. */
const ROSTER_TRANSCRIPT_DOMAIN = 'patches-e2ee-v1/node-roster-canonical';
/**
 * Same constant as the server codec's `PREKEY_BUNDLE_TRANSCRIPT_DOMAIN` (B-107: the
 * enrollment flow is the first client that must *produce* these bytes, so the writer
 * half of that encoder lives here too — field-for-field the server's
 * `encodePrekeyBundleTranscript`, including its pinned-empty `protocolVersion`).
 */
const PREKEY_BUNDLE_TRANSCRIPT_DOMAIN = 'patches-e2ee-v1/signed-prekey-bundle';

export interface DecodedCertificateTranscript {
  readonly actorId: string;
  readonly deviceId: string;
  readonly rootGeneration: number;
  readonly certificateVersion: number;
  readonly signingPublicKey: Bytes;
  readonly agreementPublicKey: Bytes;
  readonly supportedProtocolVersions: readonly string[];
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
}

/**
 * The node's certificate transcript encoder — field-for-field the server codec's
 * `encodeCertificateTranscript`. The enrollment flow uses this to build the bytes its
 * own root signature covers.
 */
export function encodeCertificateTranscript(fields: DecodedCertificateTranscript): Bytes {
  const writer = new ByteWriter()
    .string(CERTIFICATE_TRANSCRIPT_DOMAIN)
    .string(fields.actorId)
    .string(fields.deviceId)
    .u32(fields.rootGeneration)
    .u32(fields.certificateVersion)
    .fixed(fields.signingPublicKey, KEY_BYTES)
    .fixed(fields.agreementPublicKey, KEY_BYTES)
    .u32(fields.supportedProtocolVersions.length);
  for (const version of fields.supportedProtocolVersions) writer.string(version);
  return writer.u64(fields.createdAtMs).u64(fields.expiresAtMs).finish();
}

export interface DecodedRosterEntryTranscript {
  readonly deviceId: string;
  readonly certificateDigest: Bytes;
  readonly active: boolean;
  readonly addedAtMs: number;
  readonly revokedAtMs?: number | undefined;
}

export interface DecodedRosterTranscript {
  readonly actorId: string;
  readonly sequence: bigint;
  readonly rootGeneration: number;
  readonly previousDigest: Bytes;
  readonly entries: readonly DecodedRosterEntryTranscript[];
}

/** The node's roster transcript encoder — mirrors `encodeRosterTranscript` server-side. */
export function encodeRosterTranscript(fields: DecodedRosterTranscript): Bytes {
  if (fields.sequence < 0n || fields.sequence > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Roster sequence is out of range.');
  }
  const writer = new ByteWriter()
    .string(ROSTER_TRANSCRIPT_DOMAIN)
    .string(fields.actorId)
    .u64(Number(fields.sequence))
    .u32(fields.rootGeneration)
    .fixed(fields.previousDigest, KEY_BYTES)
    .u32(fields.entries.length);
  for (const entry of fields.entries) {
    writer
      .string(entry.deviceId)
      .fixed(entry.certificateDigest, KEY_BYTES)
      .u8(entry.active ? 1 : 0)
      .u64(entry.addedAtMs);
    const revokedAtMs = entry.revokedAtMs;
    if (revokedAtMs === undefined) {
      writer.u8(0).u64(0);
    } else {
      writer.u8(1).u64(revokedAtMs);
    }
  }
  return writer.finish();
}

export interface PrekeyBundleTranscriptFields {
  readonly certificateDigest: Bytes;
  readonly agreementPublicKey: Bytes;
  /**
   * Pinned to the empty string by the node's verifier (`device-roster.service.ts`): a
   * device's advertised protocol versions are not a persisted column, so enroll-time and
   * rotate-time transcripts must agree on this placeholder. The enrollment flow passes
   * `''` and this type keeps the field explicit rather than hiding the agreement.
   */
  readonly protocolVersion: string;
  readonly actorId: string;
  readonly deviceId: string;
  readonly signedPrekeyId: number;
  readonly signedPrekeyPublicKey: Bytes;
  readonly signedPrekeyCreatedAtMs: number;
  readonly signedPrekeyExpiresAtMs: number;
}

/**
 * The node's signed-prekey bundle transcript encoder — field-for-field the server
 * codec's `encodePrekeyBundleTranscript`. Both signatures `EnrollDevice` carries over a
 * new signed prekey (`signed_prekey.signature` and `prekey_bundle_signature`) cover
 * these bytes, verified against this exact layout server-side.
 */
export function encodePrekeyBundleTranscript(fields: PrekeyBundleTranscriptFields): Bytes {
  if (
    !Number.isSafeInteger(fields.signedPrekeyId) ||
    fields.signedPrekeyId < 0 ||
    fields.signedPrekeyId > Number.MAX_SAFE_INTEGER
  ) {
    throw new Error('Signed prekey id is out of range.');
  }
  return new ByteWriter()
    .string(PREKEY_BUNDLE_TRANSCRIPT_DOMAIN)
    .fixed(fields.certificateDigest, KEY_BYTES)
    .fixed(fields.agreementPublicKey, KEY_BYTES)
    .string(fields.protocolVersion)
    .string(fields.actorId)
    .string(fields.deviceId)
    .u64(fields.signedPrekeyId)
    .fixed(fields.signedPrekeyPublicKey, KEY_BYTES)
    .u64(fields.signedPrekeyCreatedAtMs)
    .u64(fields.signedPrekeyExpiresAtMs)
    .finish();
}

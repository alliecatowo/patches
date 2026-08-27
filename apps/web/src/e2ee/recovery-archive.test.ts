/**
 * The web recovery-archive seam (issue #272, ADR 0020 §10): sealing/opening under a
 * generated recovery key, and the root-key coherence check restore relies on before it
 * ever certifies a fresh device. Mirrors `apps/tui/src/e2ee/recovery-archive.test.ts` —
 * this module is a byte-for-byte port of the TUI seam.
 */
import { generateSigningKeyPair, randomBytes, signMessagingRoot } from '@patches/crypto';
import { E2EE_RECOVERY_KEY_BYTES, type E2eeRecoveryArchiveDocument } from '@patches/domain';
import { describe, expect, it } from 'vitest';

import {
  buildRestorePlan,
  generateRecoveryKey,
  openRecoveryArchive,
  RecoveryArchiveError,
  sealRecoveryArchive,
  verifyArchiveRootKeyCoherence,
} from './recovery-archive.js';

const ACTOR_ID = 'actor-1';

function validDocument(overrides: Partial<E2eeRecoveryArchiveDocument> = {}): {
  readonly document: E2eeRecoveryArchiveDocument;
  readonly rootPrivateKey: Uint8Array;
} {
  const root = generateSigningKeyPair();
  const signedRoot = signMessagingRoot(root.privateKey, {
    actorId: ACTOR_ID,
    generation: 1,
    publicKey: root.publicKey,
    createdAtMs: 1_700_000_000_000,
  });
  const document: E2eeRecoveryArchiveDocument = {
    actorId: ACTOR_ID,
    rootGeneration: 1,
    rootPrivateKey: root.privateKey,
    rootPublicKey: root.publicKey,
    rootBytes: signedRoot.rootBytes,
    rootSelfSignature: signedRoot.selfSignature,
    rosterBytes: randomBytes(48),
    rosterSignature: randomBytes(64),
    rosterSequence: 1n,
    rosterDigest: randomBytes(32),
    createdAtMs: 1_700_000_000_500,
    conversations: [],
    history: [],
    settings: undefined,
    ...overrides,
  };
  return { document, rootPrivateKey: root.privateKey };
}

describe('sealRecoveryArchive / openRecoveryArchive', () => {
  it('round-trips a document through seal and open under the same recovery key', () => {
    const { document } = validDocument();
    const recoveryKey = generateRecoveryKey();

    const { archive } = sealRecoveryArchive(document, recoveryKey);
    const opened = openRecoveryArchive(archive, recoveryKey);

    expect(opened.actorId).toBe(document.actorId);
    expect(opened.rootGeneration).toBe(document.rootGeneration);
    expect([...opened.rootPrivateKey]).toEqual([...document.rootPrivateKey]);
    expect([...opened.rootPublicKey]).toEqual([...document.rootPublicKey]);
    expect([...opened.rosterBytes]).toEqual([...document.rosterBytes]);
    expect(opened.rosterSequence).toBe(document.rosterSequence);
    expect(opened.conversations).toHaveLength(0);
    expect(opened.history).toHaveLength(0);
  });

  it('generates a fresh 32-byte recovery key every call', () => {
    const first = generateRecoveryKey();
    const second = generateRecoveryKey();
    expect(first).toHaveLength(E2EE_RECOVERY_KEY_BYTES);
    expect([...first]).not.toEqual([...second]);
  });

  it('fails closed with the wrong recovery key', () => {
    const { document } = validDocument();
    const recoveryKey = generateRecoveryKey();
    const wrongKey = generateRecoveryKey();

    const { archive } = sealRecoveryArchive(document, recoveryKey);

    expect(() => openRecoveryArchive(archive, wrongKey)).toThrow(RecoveryArchiveError);
  });

  it('fails closed on a tampered container', () => {
    const { document } = validDocument();
    const recoveryKey = generateRecoveryKey();
    const { archive } = sealRecoveryArchive(document, recoveryKey);
    const tampered = archive.slice();
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 0xff;

    expect(() => openRecoveryArchive(tampered, recoveryKey)).toThrow(RecoveryArchiveError);
  });
});

describe('verifyArchiveRootKeyCoherence', () => {
  it('accepts a document whose private key actually derives the published public key', () => {
    const { document } = validDocument();
    const recoveryKey = generateRecoveryKey();
    const { view } = sealRecoveryArchive(document, recoveryKey);

    expect(() => verifyArchiveRootKeyCoherence(view)).not.toThrow();
  });

  it('rejects a mismatched root key pair (public key does not belong to the private key)', () => {
    const { document } = validDocument();
    const otherPublicKey = generateSigningKeyPair().publicKey;
    const recoveryKey = generateRecoveryKey();
    const { view } = sealRecoveryArchive(
      { ...document, rootPublicKey: otherPublicKey },
      recoveryKey,
    );

    expect(() => verifyArchiveRootKeyCoherence(view)).toThrow(RecoveryArchiveError);
  });

  it('rejects a root self-signature that does not verify over the root transcript', () => {
    const { document } = validDocument();
    const recoveryKey = generateRecoveryKey();
    const { view } = sealRecoveryArchive(
      { ...document, rootSelfSignature: randomBytes(64) },
      recoveryKey,
    );

    expect(() => verifyArchiveRootKeyCoherence(view)).toThrow(RecoveryArchiveError);
  });
});

describe('buildRestorePlan', () => {
  it('composes coherence + roster-acceptance into a fresh-enrollment plan', () => {
    const { document } = validDocument();
    const recoveryKey = generateRecoveryKey();
    const { view } = sealRecoveryArchive(document, recoveryKey);

    const plan = buildRestorePlan(view, {
      sequence: document.rosterSequence,
      digest: document.rosterDigest,
    });

    expect(plan.actorId).toBe(document.actorId);
    expect(plan.roster.sequence).toBe(document.rosterSequence);
  });

  it('refuses a served roster that rolls back the archive chain', () => {
    const { document } = validDocument({ rosterSequence: 5n });
    const recoveryKey = generateRecoveryKey();
    const { view } = sealRecoveryArchive(document, recoveryKey);

    expect(() => buildRestorePlan(view, { sequence: 3n, digest: document.rosterDigest })).toThrow();
  });
});

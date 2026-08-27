/**
 * `patches e2ee export-recovery`/`import-recovery` (issue #272) — the pure, network-free
 * pieces: flag parsing, the export document builder, and the restore-plan-to-record
 * builder. The full round trip (export → wipe → import → enroll) is covered by
 * `../e2ee/recovery-restore.e2e.test.ts`, which needs a fake transport/vault.
 */
import { generateSigningKeyPair, signMessagingRoot } from '@patches/crypto';
import { planRecoveryRestore, type E2eeRecoveryArchiveDocument } from '@patches/domain';
import { describe, expect, it } from 'vitest';

import { encodeRecoveryArchiveDocument } from '@patches/domain';
import { sha256Digest } from '../e2ee/history-transfer.js';
import { testLocalIdentity } from '../e2ee/test-support.js';
import type { StoredEnrollment } from '../e2ee/enrollment.js';
import {
  buildExportDocument,
  buildRestoredEnrollmentRecord,
  parseExportRecoveryFlags,
  parseImportRecoveryFlags,
  ROTATED_ROOT_RESTORE_REFUSAL_COPY,
} from './e2ee-recovery.js';

const ACTOR_ID = 'actor-1';
const NOW_MS = 1_770_000_000_000;

describe('parseExportRecoveryFlags', () => {
  it('defaults to no --out', () => {
    const parsed = parseExportRecoveryFlags([]);
    expect('error' in parsed).toBe(false);
    if ('error' in parsed) return;
    expect(parsed.out).toBeUndefined();
    expect(parsed.help).toBe(false);
  });

  it('accepts --out <path>', () => {
    const parsed = parseExportRecoveryFlags(['--out', '/tmp/archive.bin']);
    expect('error' in parsed).toBe(false);
    if ('error' in parsed) return;
    expect(parsed.out).toBe('/tmp/archive.bin');
  });

  it('accepts --out=<path>', () => {
    const parsed = parseExportRecoveryFlags(['--out=/tmp/archive.bin']);
    expect('error' in parsed).toBe(false);
    if ('error' in parsed) return;
    expect(parsed.out).toBe('/tmp/archive.bin');
  });

  it('rejects --out with no value', () => {
    expect(parseExportRecoveryFlags(['--out'])).toMatchObject({
      error: '--out needs a path.',
    });
  });

  it('rejects an unknown option', () => {
    const parsed = parseExportRecoveryFlags(['--bogus']);
    expect('error' in parsed).toBe(true);
    if (!('error' in parsed)) return;
    expect(parsed.error).toMatch(/Unknown option/);
  });

  it('recognizes -h/--help', () => {
    expect(parseExportRecoveryFlags(['--help'])).toMatchObject({ help: true });
    expect(parseExportRecoveryFlags(['-h'])).toMatchObject({ help: true });
  });
});

describe('parseImportRecoveryFlags', () => {
  it('requires a positional path', () => {
    const parsed = parseImportRecoveryFlags([]);
    expect('error' in parsed).toBe(true);
    if (!('error' in parsed)) return;
    expect(parsed.error).toMatch(/path is required/);
  });

  it('accepts a path', () => {
    const parsed = parseImportRecoveryFlags(['/tmp/archive.bin']);
    expect('error' in parsed).toBe(false);
    if ('error' in parsed) return;
    expect(parsed.path).toBe('/tmp/archive.bin');
  });

  it('rejects a flag-shaped first argument as the path', () => {
    const parsed = parseImportRecoveryFlags(['--out']);
    expect('error' in parsed).toBe(true);
    if (!('error' in parsed)) return;
    expect(parsed.error).toMatch(/path is required/);
  });

  it('recognizes -h/--help without requiring a path', () => {
    expect(parseImportRecoveryFlags(['--help'])).toMatchObject({ help: true });
  });
});

describe('buildExportDocument', () => {
  it('carries only the root keypair and current verified roster — never conversations or history', () => {
    const { local } = testLocalIdentity(ACTOR_ID, 'device-1');
    const enrollment: StoredEnrollment = {
      submitted: true,
      createdRoot: true,
      rootPrivate: generateSigningKeyPair().privateKey,
      rootPublic: local.ownRoster.root.publicKey,
      identity: local,
    };

    const document = buildExportDocument(ACTOR_ID, enrollment, NOW_MS);

    expect(document.actorId).toBe(ACTOR_ID);
    expect(document.rootGeneration).toBe(local.ownRoster.root.generation);
    expect(document.rootPublicKey).toBe(enrollment.rootPublic);
    expect(document.rosterSequence).toBe(BigInt(local.ownRoster.sequence));
    expect(document.conversations).toHaveLength(0);
    expect(document.history).toHaveLength(0);
    expect(document.settings).toBeUndefined();
  });
});

describe('buildRestoredEnrollmentRecord', () => {
  function generation1Plan() {
    const root = generateSigningKeyPair();
    const signedRoot = signMessagingRoot(root.privateKey, {
      actorId: ACTOR_ID,
      generation: 1,
      publicKey: root.publicKey,
      createdAtMs: NOW_MS - 10_000,
    });
    const document: E2eeRecoveryArchiveDocument = {
      actorId: ACTOR_ID,
      rootGeneration: 1,
      rootPrivateKey: root.privateKey,
      rootPublicKey: root.publicKey,
      rootBytes: signedRoot.rootBytes,
      rootSelfSignature: signedRoot.selfSignature,
      rosterBytes: new Uint8Array(48).fill(7),
      rosterSignature: new Uint8Array(64).fill(9),
      rosterSequence: 1n,
      rosterDigest: new Uint8Array(32).fill(1),
      createdAtMs: NOW_MS - 5_000,
      conversations: [],
      history: [],
      settings: undefined,
    };
    const view = encodeRecoveryArchiveDocument(document, { digest: sha256Digest });
    return planRecoveryRestore(view);
  }

  it('mints a fresh, unsubmitted record certified by the restored root, no ratchet/prekey/old-device leakage', () => {
    const plan = generation1Plan();

    const record = buildRestoredEnrollmentRecord(plan, NOW_MS);

    expect(record.submitted).toBe(false);
    expect(record.createdRoot).toBe(false);
    expect([...record.rootPublic]).toEqual([...plan.rootPublicKey]);
    expect(record.identity.actorId).toBe(ACTOR_ID);
    // The record type itself has no field for ratchet state, skipped keys, or old device
    // keys — it holds only a freshly generated device identity plus the restored root.
    expect(Object.keys(record).sort()).toEqual(
      ['createdRoot', 'identity', 'rootPrivate', 'rootPublic', 'submitted'].sort(),
    );
    expect(Object.keys(record.identity).sort()).toEqual(
      [
        'actorId',
        'deviceId',
        'keys',
        'ownBundle',
        'ownRoster',
        'oneTimePreKeys',
        'selfDevice',
        'signedPreKey',
      ].sort(),
    );
  });

  it('refuses a rotated (generation > 1) root rather than minting a mismatched generation-1 certificate', () => {
    const plan = generation1Plan();
    const rotatedPlan = { ...plan, rootGeneration: 2 };

    // The signed root transcript itself still says generation 1 (only the plan's summary
    // field was altered), so this exercises `verifyMessagingRoot`'s own decoded generation
    // rather than a value this helper could be tricked by — build a real generation-2 root
    // instead to prove the refusal is genuine.
    const root = generateSigningKeyPair();
    const signedRoot = signMessagingRoot(root.privateKey, {
      actorId: ACTOR_ID,
      generation: 2,
      publicKey: root.publicKey,
      createdAtMs: NOW_MS - 10_000,
    });
    const generation2Plan = {
      ...rotatedPlan,
      rootPrivateKey: root.privateKey,
      rootPublicKey: root.publicKey,
      rootBytes: signedRoot.rootBytes,
      rootSelfSignature: signedRoot.selfSignature,
    };

    expect(() => buildRestoredEnrollmentRecord(generation2Plan, NOW_MS)).toThrow(
      ROTATED_ROOT_RESTORE_REFUSAL_COPY,
    );
  });
});

import { describe, expect, it } from 'vitest';

import {
  E2EE_RECOVERY_ARCHIVE_DOMAIN,
  E2EE_RECOVERY_ARCHIVE_VERSION,
  E2EE_RECOVERY_KEY_BYTES,
  E2EE_RECOVERY_MAX_CONVERSATIONS,
  E2EE_RECOVERY_MAX_HISTORY_ENTRIES,
  E2EE_RECOVERY_MAX_SETTINGS_BYTES,
  assertRecoveryArchiveShape,
  assertRestoredDeviceCertificateIsFresh,
  assertServedRosterAcceptsRestore,
  canonicalRecoveryArchiveTranscript,
  decodeRecoveryArchiveDocument,
  decodeRecoveryCode,
  encodeRecoveryArchiveDocument,
  encodeRecoveryCode,
  groupRecoveryCodeForDisplay,
  planRecoveryRestore,
  recoveryCodeChecksumByte,
  type E2eeRecoveryArchiveDocument,
  type E2eeRecoveryConversationEntry,
  type E2eeRecoveryRestorePlan,
} from './recovery.js';
import { fakeDigest, seededBytes } from './testing.js';
import type { E2eeHistoryEntryFields } from './history-transfer.js';

const digest = fakeDigest;

function conversation(overrides: Partial<E2eeRecoveryConversationEntry> = {}) {
  return {
    conversationId: 'conv-1',
    membershipEpoch: 1n,
    groupControlDigest: seededBytes(32, 10),
    ...overrides,
  };
}

function historyEntry(overrides: Partial<E2eeHistoryEntryFields> = {}): E2eeHistoryEntryFields {
  return {
    conversationId: 'conv-1',
    logicalMessageId: 'msg-1',
    senderActorId: 'actor-1',
    senderDeviceId: 'device-1',
    membershipEpoch: 1n,
    acceptedAtMs: 1_000,
    plaintext: seededBytes(16, 1),
    ...overrides,
  };
}

function document(
  overrides: Partial<E2eeRecoveryArchiveDocument> = {},
): E2eeRecoveryArchiveDocument {
  return {
    actorId: 'actor-1',
    rootGeneration: 1,
    rootPrivateKey: seededBytes(32, 2),
    rootPublicKey: seededBytes(32, 3),
    rootBytes: seededBytes(48, 4),
    rootSelfSignature: seededBytes(64, 5),
    rosterBytes: seededBytes(48, 6),
    rosterSignature: seededBytes(64, 7),
    rosterSequence: 1n,
    rosterDigest: seededBytes(32, 8),
    createdAtMs: 1_700_000_000_000,
    conversations: [conversation()],
    history: [historyEntry()],
    settings: seededBytes(16, 9),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Recovery code codec
// ---------------------------------------------------------------------------

describe('recovery code codec', () => {
  it('round-trips a key through encode/decode', () => {
    const key = seededBytes(E2EE_RECOVERY_KEY_BYTES, 1);
    const code = encodeRecoveryCode(key);
    expect(code).toHaveLength(66);
    expect([...decodeRecoveryCode(code)]).toEqual([...key]);
  });

  it('accepts grouped display form with separators and mixed case', () => {
    const key = seededBytes(E2EE_RECOVERY_KEY_BYTES, 2);
    const code = encodeRecoveryCode(key);
    const grouped = groupRecoveryCodeForDisplay(code).toUpperCase();
    expect([...decodeRecoveryCode(grouped)]).toEqual([...key]);
  });

  it('rejects a malformed code', () => {
    expect(() => decodeRecoveryCode('not-a-code')).toThrow(/not a recovery code/);
    expect(() => decodeRecoveryCode('ab'.repeat(32))).toThrow(/not a recovery code/); // too short (64 chars, no checksum)
  });

  it('rejects a code with a mistyped digit via checksum', () => {
    const key = seededBytes(E2EE_RECOVERY_KEY_BYTES, 3);
    const code = encodeRecoveryCode(key);
    // Flip the first hex character to the next digit in a 16-symbol cycle, guaranteed to
    // change the decoded key byte (and thus the checksum) regardless of its original value.
    const firstChar = code[0]!;
    const flipped = ((Number.parseInt(firstChar, 16) + 1) % 16).toString(16);
    const corrupted = flipped + code.slice(1);
    expect(() => decodeRecoveryCode(corrupted)).toThrow(/checksum/);
  });

  it('checksum rejects a bad key length', () => {
    expect(() => recoveryCodeChecksumByte(seededBytes(16, 1))).toThrow(/32 bytes/);
  });
});

// ---------------------------------------------------------------------------
// Shape validation
// ---------------------------------------------------------------------------

describe('assertRecoveryArchiveShape', () => {
  it('accepts a well-formed document', () => {
    expect(() => assertRecoveryArchiveShape(document())).not.toThrow();
  });

  it('rejects an invalid actor id', () => {
    expect(() => assertRecoveryArchiveShape(document({ actorId: '' }))).toThrow(/invalid/);
  });

  it('rejects a non-positive root generation', () => {
    expect(() => assertRecoveryArchiveShape(document({ rootGeneration: 0 }))).toThrow(
      /positive integer/,
    );
  });

  it('rejects wrong-length key material', () => {
    expect(() =>
      assertRecoveryArchiveShape(document({ rootPrivateKey: seededBytes(16, 1) })),
    ).toThrow(/32 bytes/);
    expect(() =>
      assertRecoveryArchiveShape(document({ rootPublicKey: seededBytes(16, 1) })),
    ).toThrow(/32 bytes/);
    expect(() =>
      assertRecoveryArchiveShape(document({ rootSelfSignature: seededBytes(16, 1) })),
    ).toThrow(/64 bytes/);
    expect(() =>
      assertRecoveryArchiveShape(document({ rosterSignature: seededBytes(16, 1) })),
    ).toThrow(/64 bytes/);
    expect(() =>
      assertRecoveryArchiveShape(document({ rosterDigest: seededBytes(16, 1) })),
    ).toThrow(/32 bytes/);
  });

  it('rejects empty root/roster transcripts', () => {
    expect(() => assertRecoveryArchiveShape(document({ rootBytes: new Uint8Array() }))).toThrow(
      /empty/,
    );
    expect(() => assertRecoveryArchiveShape(document({ rosterBytes: new Uint8Array() }))).toThrow(
      /empty/,
    );
  });

  it('rejects a roster sequence below 1', () => {
    expect(() => assertRecoveryArchiveShape(document({ rosterSequence: 0n }))).toThrow(
      /starts at 1/,
    );
  });

  it('rejects an invalid creation time', () => {
    expect(() => assertRecoveryArchiveShape(document({ createdAtMs: -1 }))).toThrow(/invalid/);
  });

  it('rejects too many conversations or history entries', () => {
    const tooManyConversations = Array.from(
      { length: E2EE_RECOVERY_MAX_CONVERSATIONS + 1 },
      (_, i) => conversation({ conversationId: `conv-${String(i)}` }),
    );
    expect(() =>
      assertRecoveryArchiveShape(document({ conversations: tooManyConversations })),
    ).toThrow(/more than/);

    const tooManyHistory = Array.from({ length: E2EE_RECOVERY_MAX_HISTORY_ENTRIES + 1 }, (_, i) =>
      historyEntry({ logicalMessageId: `msg-${String(i)}` }),
    );
    expect(() => assertRecoveryArchiveShape(document({ history: tooManyHistory }))).toThrow(
      /more than/,
    );
  });

  it('rejects oversize settings', () => {
    expect(() =>
      assertRecoveryArchiveShape(
        document({ settings: seededBytes(E2EE_RECOVERY_MAX_SETTINGS_BYTES + 1, 1) }),
      ),
    ).toThrow(/exceed/);
  });

  it('delegates history entries to assertHistoryEntryFields', () => {
    expect(() =>
      assertRecoveryArchiveShape(
        document({ history: [historyEntry({ plaintext: new Uint8Array() })] }),
      ),
    ).toThrow(/empty/);
  });
});

// ---------------------------------------------------------------------------
// Canonical transcript / codec round-trip
// ---------------------------------------------------------------------------

describe('canonicalRecoveryArchiveTranscript', () => {
  it('is deterministic and sensitive to every top-level field', () => {
    const base = canonicalRecoveryArchiveTranscript(document());
    expect([...canonicalRecoveryArchiveTranscript(document())]).toEqual([...base]);
    expect([...canonicalRecoveryArchiveTranscript(document({ actorId: 'actor-9' }))]).not.toEqual([
      ...base,
    ]);
    expect([
      ...canonicalRecoveryArchiveTranscript(document({ rootPrivateKey: seededBytes(32, 99) })),
    ]).not.toEqual([...base]);
    expect([
      ...canonicalRecoveryArchiveTranscript(document({ settings: seededBytes(16, 88) })),
    ]).not.toEqual([...base]);
  });

  it('rejects an invalid conversation embedded in the list', () => {
    expect(() =>
      canonicalRecoveryArchiveTranscript(
        document({ conversations: [conversation({ membershipEpoch: 0n })] }),
      ),
    ).toThrow(/start at 1/);
  });
});

describe('encode/decode round-trip', () => {
  it('round-trips a document and recomputes the digest identically', () => {
    const view = encodeRecoveryArchiveDocument(document(), { digest });
    const decoded = decodeRecoveryArchiveDocument(view.documentBytes, { digest });
    expect(decoded.actorId).toBe(view.actorId);
    expect(decoded.rootGeneration).toBe(view.rootGeneration);
    expect([...decoded.rootPrivateKey]).toEqual([...view.rootPrivateKey]);
    expect(decoded.conversations).toEqual(view.conversations);
    expect(decoded.history).toEqual(view.history);
    expect([...decoded.documentDigest]).toEqual([...view.documentDigest]);
    expect(decoded.version).toBe(E2EE_RECOVERY_ARCHIVE_VERSION);
  });

  it('round-trips with no history and no settings', () => {
    const view = encodeRecoveryArchiveDocument(document({ history: [], settings: undefined }), {
      digest,
    });
    const decoded = decodeRecoveryArchiveDocument(view.documentBytes, { digest });
    expect(decoded.history).toEqual([]);
    expect(decoded.settings).toBeUndefined();
  });

  it('rejects a foreign domain separator', () => {
    const view = encodeRecoveryArchiveDocument(document(), { digest });
    const tampered = view.documentBytes.slice();
    tampered[5] = 0x58;
    expect(() => decodeRecoveryArchiveDocument(tampered, { digest })).toThrow(/foreign domain/);
  });

  it('rejects an unknown version', () => {
    const view = encodeRecoveryArchiveDocument(document(), { digest });
    const tampered = view.documentBytes.slice();
    const versionOffset = 4 + new TextEncoder().encode(E2EE_RECOVERY_ARCHIVE_DOMAIN).length + 4;
    tampered[versionOffset] = 2;
    expect(() => decodeRecoveryArchiveDocument(tampered, { digest })).toThrow(/version/);
  });

  it('rejects truncated and trailing bytes', () => {
    const view = encodeRecoveryArchiveDocument(document(), { digest });
    expect(() =>
      decodeRecoveryArchiveDocument(view.documentBytes.slice(0, -1), { digest }),
    ).toThrow(/truncated/);
    const trailing = new Uint8Array(view.documentBytes.length + 1);
    trailing.set(view.documentBytes, 0);
    expect(() => decodeRecoveryArchiveDocument(trailing, { digest })).toThrow(/trailing/);
  });

  it('rejects a shape violation hiding inside well-framed bytes', () => {
    const view = encodeRecoveryArchiveDocument(document({ rootGeneration: 0x11223344 }), {
      digest,
    });
    // Corrupt the well-framed root generation part directly (0x11223344 -> 0x00000000),
    // which parses fine structurally but fails the positive-integer shape check on decode.
    const marker = new Uint8Array([0x11, 0x22, 0x33, 0x44]);
    let offset = -1;
    for (let i = 0; i <= view.documentBytes.length - marker.length; i += 1) {
      let match = true;
      for (let j = 0; j < marker.length; j += 1) {
        if (view.documentBytes[i + j] !== marker[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        offset = i;
        break;
      }
    }
    expect(offset).toBeGreaterThan(-1);
    const patched = view.documentBytes.slice();
    patched.set([0, 0, 0, 0], offset);
    expect(() => decodeRecoveryArchiveDocument(patched, { digest })).toThrow(/positive integer/);
  });
});

// ---------------------------------------------------------------------------
// Restore preconditions
// ---------------------------------------------------------------------------

describe('assertServedRosterAcceptsRestore', () => {
  const archive = { rosterSequence: 5n, rosterDigest: seededBytes(32, 1) };

  it('accepts a served roster at the same sequence and digest', () => {
    expect(() =>
      assertServedRosterAcceptsRestore(archive, { sequence: 5n, digest: archive.rosterDigest }),
    ).not.toThrow();
  });

  it('accepts a served roster strictly ahead', () => {
    expect(() =>
      assertServedRosterAcceptsRestore(archive, { sequence: 6n, digest: seededBytes(32, 2) }),
    ).not.toThrow();
  });

  it('refuses a served roster behind the archive (rollback)', () => {
    expect(() =>
      assertServedRosterAcceptsRestore(archive, { sequence: 4n, digest: seededBytes(32, 2) }),
    ).toThrow(/rolled-back/);
  });

  it('refuses a same-height fork', () => {
    expect(() =>
      assertServedRosterAcceptsRestore(archive, { sequence: 5n, digest: seededBytes(32, 9) }),
    ).toThrow(/forks the archive chain/);
  });
});

describe('assertRestoredDeviceCertificateIsFresh', () => {
  it('accepts a certificate created at or after the archive', () => {
    expect(() => assertRestoredDeviceCertificateIsFresh(1_000, 1_000)).not.toThrow();
    expect(() => assertRestoredDeviceCertificateIsFresh(1_000, 2_000)).not.toThrow();
  });

  it('refuses a certificate predating the archive — no replayed old enrollment', () => {
    expect(() => assertRestoredDeviceCertificateIsFresh(1_000, 999)).toThrow(/may not predate/);
  });

  it('refuses a non-integer certificate timestamp', () => {
    expect(() => assertRestoredDeviceCertificateIsFresh(1_000, Number.NaN)).toThrow(
      /may not predate/,
    );
  });
});

// ---------------------------------------------------------------------------
// planRecoveryRestore — the security-load-bearing contract:
// restore yields *only* fresh-enrollment inputs, never live session state.
// ---------------------------------------------------------------------------

describe('planRecoveryRestore', () => {
  const view = encodeRecoveryArchiveDocument(document(), { digest });
  const plan: E2eeRecoveryRestorePlan = planRecoveryRestore(view);

  it('carries the root key and roster snapshot needed for fresh enrollment', () => {
    expect(plan.actorId).toBe(view.actorId);
    expect(plan.rootGeneration).toBe(view.rootGeneration);
    expect([...plan.rootPrivateKey]).toEqual([...view.rootPrivateKey]);
    expect(plan.roster.sequence).toBe(view.rosterSequence);
    expect(plan.conversations).toEqual(view.conversations);
    expect(plan.history).toEqual(view.history);
  });

  it('exposes exactly the fresh-enrollment field set — nothing more', () => {
    // A closed allow-list, not an exclusion list: any field this test doesn't name is a
    // regression, because the whole point of a restore *plan* (vs. the raw document) is
    // that it cannot carry more than fresh-enrollment inputs.
    expect(Object.keys(plan).sort()).toEqual(
      [
        'actorId',
        'rootGeneration',
        'rootPrivateKey',
        'rootPublicKey',
        'rootBytes',
        'rootSelfSignature',
        'roster',
        'conversations',
        'history',
        'settings',
      ].sort(),
    );
    expect(Object.keys(plan.roster).sort()).toEqual(
      ['bytes', 'signature', 'sequence', 'digest'].sort(),
    );
  });

  it('never yields a ratchet counter, chain key, or root/message key field', () => {
    const forbidden = [
      'ratchet',
      'chainkey',
      'chainKey',
      'rootkey', // note: distinct from rootPrivateKey/rootPublicKey (the *messaging* root, not a ratchet root)
      'messagekey',
      'messageKey',
      'sendingchain',
      'receivingchain',
      'counter',
      'N', // ratchet message-index convention
      'PN',
    ];
    const planKeys = Object.keys(plan);
    for (const forbiddenName of forbidden) {
      expect(planKeys.some((k) => k.toLowerCase() === forbiddenName.toLowerCase())).toBe(false);
    }
  });

  it('never yields a skipped-message-key field', () => {
    const planKeys = Object.keys(plan).map((k) => k.toLowerCase());
    expect(planKeys.some((k) => k.includes('skip'))).toBe(false);
  });

  it('never yields a prekey field (one-time or signed, private or public)', () => {
    const planKeys = Object.keys(plan).map((k) => k.toLowerCase());
    expect(planKeys.some((k) => k.includes('prekey'))).toBe(false);
  });

  it('never yields a device identity private key — new or revoked', () => {
    // The only private key material in the plan is the messaging-root private key, which
    // is not a device identity key: it certifies a *fresh* device via EnrollDevice, it does
    // not restore an old device's identity key. There is no "deviceKey"/"identityKey" field
    // at all.
    const planKeys = Object.keys(plan).map((k) => k.toLowerCase());
    expect(planKeys.some((k) => k.includes('device') && k.includes('key'))).toBe(false);
    expect(planKeys.some((k) => k.includes('identitykey'))).toBe(false);
    expect(planKeys.some((k) => k.includes('revoked'))).toBe(false);
  });

  it('re-runs shape validation, so a plan can never be built from an invalid view', () => {
    const invalid = { ...view, rosterSequence: 0n };
    expect(() => planRecoveryRestore(invalid)).toThrow(/starts at 1/);
  });

  it('history entries in the plan remain display-only fields, never session-shaped', () => {
    // Every history entry field is bound to the display-transfer contract's own closed
    // shape (conversationId, logicalMessageId, sender ids, membershipEpoch, acceptedAtMs,
    // plaintext) — there is no ratchet index, no key, no nonce alongside the plaintext.
    for (const entry of plan.history) {
      expect(Object.keys(entry).sort()).toEqual(
        [
          'conversationId',
          'logicalMessageId',
          'senderActorId',
          'senderDeviceId',
          'membershipEpoch',
          'acceptedAtMs',
          'plaintext',
        ].sort(),
      );
    }
  });
});

// ---------------------------------------------------------------------------
// End-to-end: build an archive, seal-free round trip through the domain codec,
// then plan a restore — asserting the negative property holds across the whole
// create -> encode -> decode -> plan pipeline, not just at one layer.
// ---------------------------------------------------------------------------

describe('archive-to-restore-plan pipeline never carries session state', () => {
  it('a document built with deliberately named "ratchet-looking" conversation/history data still only plans fresh-enrollment fields', () => {
    // Even if an archiving client tried to smuggle session-shaped data into the only two
    // open-ended byte fields (settings, history plaintext), the restore plan never
    // interprets those blobs as anything but opaque/display data — it has no field to
    // route them into a ratchet.
    const suspicious = document({
      settings: seededBytes(64, 1), // stands in for "a caller tried to put ratchet state here"
      history: [
        historyEntry({ plaintext: seededBytes(64, 2) }), // stands in for "a skipped key smuggled as plaintext"
      ],
    });
    const view = encodeRecoveryArchiveDocument(suspicious, { digest });
    const decoded = decodeRecoveryArchiveDocument(view.documentBytes, { digest });
    const plan = planRecoveryRestore(decoded);

    // The plan carries the bytes through as opaque settings/history — never decoded as key
    // material, never merged into rootPrivateKey, never given a ratchet-shaped field.
    expect(plan.settings).toBeDefined();
    expect(Object.keys(plan).sort()).not.toContain('ratchetState');
    expect(Object.keys(plan).sort()).not.toContain('skippedKeys');
    expect(Object.keys(plan).sort()).not.toContain('prekeys');
    expect(Object.keys(plan).sort()).not.toContain('deviceIdentityKey');
  });
});

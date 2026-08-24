import { describe, expect, it } from 'vitest';

import {
  decodeVaultDocument,
  deriveVaultDataKey,
  encodeVaultDocument,
  openSealedVaultFile,
  parseSealedVaultFile,
  sealVaultFile,
} from './vault-format.js';
import { VaultCorruptionError } from './vault-errors.js';

const KEY = new Uint8Array(32).fill(7);
const OTHER_KEY = new Uint8Array(32).fill(9);

describe('sealVaultFile / parseSealedVaultFile', () => {
  it('round-trips generation and payload', () => {
    const sealed = sealVaultFile(KEY, 12, new Uint8Array([1, 2, 3]));
    const parsed = parseSealedVaultFile(sealed);
    expect(parsed.generation).toBe(12);
    expect(openSealedVaultFile(KEY, parsed)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('produces a fresh nonce per seal (identical input, different bytes)', () => {
    const first = sealVaultFile(KEY, 1, new Uint8Array([1]));
    const second = sealVaultFile(KEY, 1, new Uint8Array([1]));
    expect(first).not.toEqual(second);
  });

  it('fails closed on a tampered ciphertext', () => {
    const sealed = sealVaultFile(KEY, 3, new Uint8Array([1, 2, 3]));
    const last = sealed.length - 1;
    sealed[last] = (sealed[last] ?? 0) ^ 0xff;
    expect(() => openSealedVaultFile(KEY, parseSealedVaultFile(sealed))).toThrow(
      VaultCorruptionError,
    );
  });

  it('fails closed when the clear generation is tampered (it is AEAD-bound)', () => {
    const sealed = sealVaultFile(KEY, 3, new Uint8Array([1, 2, 3]));
    // generation sits at magic(7) + version(1), big-endian u64.
    sealed[8] = (sealed[8] ?? 0) ^ 0xff;
    expect(() => openSealedVaultFile(KEY, parseSealedVaultFile(sealed))).toThrow(
      VaultCorruptionError,
    );
  });

  it('fails closed under the wrong key', () => {
    const parsed = parseSealedVaultFile(sealVaultFile(KEY, 1, new Uint8Array([4])));
    expect(() => openSealedVaultFile(OTHER_KEY, parsed)).toThrow(VaultCorruptionError);
  });

  it('rejects truncated, extended, and magic-less files', () => {
    const sealed = sealVaultFile(KEY, 1, new Uint8Array([1, 2, 3]));
    expect(() => parseSealedVaultFile(sealed.slice(0, sealed.length - 2))).toThrow(
      VaultCorruptionError,
    );
    expect(() => parseSealedVaultFile(new Uint8Array([...sealed, 0]))).toThrow(
      VaultCorruptionError,
    );
    expect(() => parseSealedVaultFile(new Uint8Array(sealed.length).fill(0))).toThrow(
      VaultCorruptionError,
    );
  });
});

describe('vault document codec', () => {
  it('round-trips sessions with and without staged records', () => {
    const document = {
      sessions: new Map([
        ['alice', { live: new Uint8Array([1, 2]), staged: undefined }],
        ['bob', { live: new Uint8Array([3]), staged: new Uint8Array([9, 9]) }],
      ]),
    };
    expect(decodeVaultDocument(encodeVaultDocument(document))).toEqual(document);
  });

  it('rejects an unknown document version and truncated bodies', () => {
    const good = encodeVaultDocument({ sessions: new Map() });
    const badVersion = new Uint8Array(good);
    badVersion[0] = 99;
    expect(() => decodeVaultDocument(badVersion)).toThrow(VaultCorruptionError);
    expect(() => decodeVaultDocument(good.slice(0, good.length - 1))).toThrow(VaultCorruptionError);
  });
});

describe('deriveVaultDataKey', () => {
  it('derives account-distinct keys from one wrapping key', () => {
    const wrapping = new Uint8Array(32).fill(3);
    const a = deriveVaultDataKey(wrapping, 'node.example:u1');
    const b = deriveVaultDataKey(wrapping, 'node.example:u2');
    expect(a).toHaveLength(32);
    expect(b).toHaveLength(32);
    expect(a).not.toEqual(b);
  });
});

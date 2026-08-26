import { describe, expect, it } from 'vitest';

import {
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
  E2EE_CONTROL_TYPES,
} from './control.js';
import { E2eeContractError } from './modes.js';
import { bytesEqual, type DigestFunction } from './types.js';

/** Trivial injectable digest (sha-256 would drag node:crypto into a pure contract test). */
const fakeDigest: DigestFunction = (input) => {
  const out = new Uint8Array(32);
  for (let index = 0; index < input.length; index += 1) {
    out[index % 32] = (out[index % 32] ?? 0) ^ (input[index] ?? 0);
  }
  return out;
};

function expectContractError(thunk: () => unknown, fragment: string): void {
  expect(thunk).toThrow(E2eeContractError);
  expect(thunk).toThrow(fragment);
}

/** Big-endian u64 part bytes, matching the codec's DataView writes. */
function beU64(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, value, false);
  return out;
}

/** Hand-builds a length-prefixed part stream, for bytes a compliant encoder never mints. */
function handBuilt(parts: readonly Uint8Array[]): Uint8Array {
  let size = 0;
  for (const part of parts) size += 4 + part.length;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let offset = 0;
  for (const part of parts) {
    view.setUint32(offset, part.length, false);
    offset += 4;
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

describe('E2EE control envelope codec (B-093/B-100)', () => {
  it('exposes the closed v1 type set and the shared domain separator', () => {
    expect([...E2EE_CONTROL_TYPES]).toEqual([
      'READ_RECEIPT',
      'TYPING_START',
      'TYPING_STOP',
      'EDIT',
      'DELETE',
    ]);
    expect(E2EE_CONTROL_ENVELOPE_DOMAIN).toBe('patches-e2ee-v1:control-envelope');
    expect(E2EE_CONTROL_ENVELOPE_VERSION).toBe(1);
  });

  it('round-trips every control type through canonical bytes', () => {
    const controls = [
      {
        type: 'READ_RECEIPT',
        createdAtMs: 1_000,
        messageIds: ['msg-1', 'msg-2', 'msg-9'],
      },
      { type: 'TYPING_START', createdAtMs: 1_001 },
      { type: 'TYPING_STOP', createdAtMs: 1_002 },
      {
        type: 'EDIT',
        createdAtMs: 1_003,
        logicalMessageId: 'msg-1',
        newPlaintext: 'edited body',
      },
      { type: 'DELETE', createdAtMs: 1_004, logicalMessageId: 'msg-2' },
    ] as const;
    for (const control of controls) {
      const view = encodeControlEnvelope(control, { digest: fakeDigest });
      expect(view.version).toBe(1);
      expect(view.envelopeBytes.length).toBeGreaterThan(0);
      expect(view.envelopeDigest).toHaveLength(32);
      expect(decodeControlEnvelope(view.envelopeBytes)).toEqual(control);
      assertControlEnvelopeDigest(view, { digest: fakeDigest });
    }
  });

  it('starts every canonical transcript with the domain separator and version', () => {
    const bytes = canonicalControlEnvelopeBytes({ type: 'TYPING_START', createdAtMs: 5 });
    const domainLength = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, false);
    expect(new TextDecoder().decode(bytes.subarray(4, 4 + domainLength))).toBe(
      E2EE_CONTROL_ENVELOPE_DOMAIN,
    );
    const versionPrefix = new DataView(bytes.buffer, bytes.byteOffset + 4 + domainLength, 4);
    expect(versionPrefix.getUint32(0, false)).toBe(1);
    expect(bytes[4 + domainLength + 4]).toBe(E2EE_CONTROL_ENVELOPE_VERSION);
  });

  it('produces identical bytes and digest for identical controls', () => {
    const control = {
      type: 'EDIT',
      createdAtMs: 42,
      logicalMessageId: 'msg-7',
      newPlaintext: 'same',
    } as const;
    const a = encodeControlEnvelope(control, { digest: fakeDigest });
    const b = encodeControlEnvelope(control, { digest: fakeDigest });
    expect(bytesEqual(a.envelopeBytes, b.envelopeBytes)).toBe(true);
    expect(bytesEqual(a.envelopeDigest, b.envelopeDigest)).toBe(true);
  });

  // ---------------------------------------------------------------- shape ---

  it('rejects a read receipt with no ids, too many ids, duplicates, or unsorted ids', () => {
    expectContractError(
      () => assertControlEnvelopeShape({ type: 'READ_RECEIPT', createdAtMs: 1, messageIds: [] }),
      'at least one',
    );
    expectContractError(
      () =>
        assertControlEnvelopeShape({
          type: 'READ_RECEIPT',
          createdAtMs: 1,
          messageIds: Array.from(
            { length: E2EE_CONTROL_MAX_READ_RECEIPT_IDS + 1 },
            (_, index) => `msg-${String(index).padStart(4, '0')}`,
          ),
        }),
      'at most',
    );
    expectContractError(
      () =>
        assertControlEnvelopeShape({
          type: 'READ_RECEIPT',
          createdAtMs: 1,
          messageIds: ['msg-1', 'msg-1'],
        }),
      'strictly ascending',
    );
    expectContractError(
      () =>
        assertControlEnvelopeShape({
          type: 'READ_RECEIPT',
          createdAtMs: 1,
          messageIds: ['msg-2', 'msg-1'],
        }),
      'strictly ascending',
    );
  });

  it('rejects an edit with an empty id, empty plaintext, or an oversize plaintext', () => {
    expectContractError(
      () =>
        assertControlEnvelopeShape({
          type: 'EDIT',
          createdAtMs: 1,
          logicalMessageId: '',
          newPlaintext: 'x',
        }),
      'invalid',
    );
    expectContractError(
      () =>
        assertControlEnvelopeShape({
          type: 'EDIT',
          createdAtMs: 1,
          logicalMessageId: 'msg-1',
          newPlaintext: '',
        }),
      'non-empty',
    );
    expectContractError(
      () =>
        assertControlEnvelopeShape({
          type: 'EDIT',
          createdAtMs: 1,
          logicalMessageId: 'msg-1',
          newPlaintext: 'x'.repeat(E2EE_CONTROL_MAX_EDIT_PLAINTEXT_BYTES + 1),
        }),
      'exceeds',
    );
  });

  it('rejects a delete with an empty logical message id and unsafe timestamps', () => {
    expectContractError(
      () => assertControlEnvelopeShape({ type: 'DELETE', createdAtMs: 1, logicalMessageId: '' }),
      'invalid',
    );
    expectContractError(
      () => assertControlEnvelopeShape({ type: 'DELETE', createdAtMs: -1, logicalMessageId: 'm' }),
      'created-at',
    );
    expectContractError(
      () => assertControlEnvelopeShape({ type: 'DELETE', createdAtMs: 1.5, logicalMessageId: 'm' }),
      'created-at',
    );
    expectContractError(
      () =>
        assertControlEnvelopeShape({
          type: 'DELETE',
          createdAtMs: Number.MAX_SAFE_INTEGER + 1,
          logicalMessageId: 'm',
        }),
      'created-at',
    );
  });

  it('enforces the whole-envelope ceiling on encode', () => {
    const oversized = {
      type: 'EDIT',
      createdAtMs: 1,
      logicalMessageId: 'msg-big',
      newPlaintext: 'x'.repeat(E2EE_CONTROL_MAX_BYTES),
    } as const;
    expectContractError(() => encodeControlEnvelope(oversized, { digest: fakeDigest }), 'exceeds');
  });

  // --------------------------------------------------------------- decode ---

  it('rejects bytes with a foreign domain separator, wrong version, or unknown type', () => {
    const good = canonicalControlEnvelopeBytes({ type: 'TYPING_STOP', createdAtMs: 9 });
    const domainLength = new DataView(good.buffer, good.byteOffset, 4).getUint32(0, false);
    const versionIndex = 4 + domainLength + 4;

    // Case-flip one byte of the domain separator: still valid UTF-8, now a foreign domain.
    const foreignDomain = new Uint8Array(good);
    foreignDomain[10] = (foreignDomain[10] ?? 0) ^ 0x20;
    expectContractError(() => decodeControlEnvelope(foreignDomain), 'foreign domain');

    const wrongVersion = new Uint8Array(good);
    wrongVersion[versionIndex] = 2;
    expectContractError(() => decodeControlEnvelope(wrongVersion), 'version');

    const encoder = new TextEncoder();
    const bogus = handBuilt([
      encoder.encode(E2EE_CONTROL_ENVELOPE_DOMAIN),
      new Uint8Array([E2EE_CONTROL_ENVELOPE_VERSION]),
      encoder.encode('BLOCK_USER'),
      beU64(1n),
    ]);
    expectContractError(() => decodeControlEnvelope(bogus), 'type');
  });

  it('rejects truncated bytes, trailing bytes, and oversize input', () => {
    const good = canonicalControlEnvelopeBytes({
      type: 'READ_RECEIPT',
      createdAtMs: 1,
      messageIds: ['msg-1'],
    });
    // Truncating by exactly one byte can land inside the final string part's *content*
    // (fatal-UTF-8 error) or inside its length prefix / past its end (truncated error) —
    // both are E2eeContractError rejections of the same truncation.
    expect(() => decodeControlEnvelope(good.subarray(0, good.length - 1))).toThrow(
      E2eeContractError,
    );
    expect(() => decodeControlEnvelope(good.subarray(0, good.length - 1))).toThrow(
      /truncated|not valid UTF-8/,
    );
    const padded = new Uint8Array(good.length + 1);
    padded.set(good, 0);
    expectContractError(() => decodeControlEnvelope(padded), 'trailing');
    const huge = new Uint8Array(E2EE_CONTROL_MAX_BYTES + 1);
    expectContractError(() => decodeControlEnvelope(huge), 'exceeds');
  });

  it('rejects a structurally valid but non-canonical read receipt (unsorted ids)', () => {
    // Hand-build a length-prefixed stream whose ids parse but descend: the shape assert
    // inside decode must reject it rather than normalizing it.
    const encoder = new TextEncoder();
    const out = handBuilt([
      encoder.encode(E2EE_CONTROL_ENVELOPE_DOMAIN),
      new Uint8Array([E2EE_CONTROL_ENVELOPE_VERSION]),
      encoder.encode('READ_RECEIPT'),
      beU64(1n),
      beU64(2n),
      encoder.encode('msg-2'),
      encoder.encode('msg-1'),
    ]);
    expectContractError(() => decodeControlEnvelope(out), 'strictly ascending');
  });

  it('rejects a non-UTF-8 edit plaintext', () => {
    const encoder = new TextEncoder();
    const out = handBuilt([
      encoder.encode(E2EE_CONTROL_ENVELOPE_DOMAIN),
      new Uint8Array([E2EE_CONTROL_ENVELOPE_VERSION]),
      encoder.encode('EDIT'),
      beU64(1n),
      encoder.encode('msg-1'),
      new Uint8Array([0xff, 0xfe, 0xfd]),
    ]);
    expectContractError(() => decodeControlEnvelope(out), 'not valid UTF-8');
  });

  it('rejects a digest that does not match the canonical bytes', () => {
    const view = encodeControlEnvelope(
      { type: 'TYPING_START', createdAtMs: 1 },
      { digest: fakeDigest },
    );
    const tampered = {
      ...view,
      envelopeDigest: new Uint8Array([...view.envelopeDigest.slice(0, 31), 1]),
    };
    expectContractError(
      () => assertControlEnvelopeDigest(tampered, { digest: fakeDigest }),
      'does not match',
    );
  });
});

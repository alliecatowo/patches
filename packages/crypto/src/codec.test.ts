import { describe, expect, it } from 'vitest';

import { ByteReader, ByteWriter, compareUtf8Bytes, fromHex, toHex } from './codec.js';
import { MalformedInputError } from './errors.js';

describe('ByteWriter#fixed', () => {
  it('requires the caller to declare a width and enforces it', () => {
    expect(() => new ByteWriter().fixed(new Uint8Array(32), 32)).not.toThrow();
    expect(() => new ByteWriter().fixed(new Uint8Array(31), 32)).toThrow(MalformedInputError);
    expect(() => new ByteWriter().fixed(new Uint8Array(33), 32)).toThrow(MalformedInputError);
  });

  /**
   * ADR 0024 B-055: before `fixed()` took a required expected width, it performed a raw append
   * with no length check at all — whatever `Uint8Array` a caller handed in was written verbatim,
   * however long it was. That silently made a "fixed-width" field variable-width in practice, so
   * two logically distinct field splits of the same total bytes could serialize identically: a
   * transcript that meant to bind `first` and `second` as two separate 2-byte fields could not be
   * told apart from one that bound a 3-byte `first` and a 1-byte `second`, once encoded. This test
   * demonstrates the collision directly against a raw, unchecked concatenation (`fixed()`'s old
   * behavior) and then shows the current `fixed()` refuses to build either offending encoding.
   */
  it('closes an unchecked-width collision between two distinct field splits', () => {
    const rawConcat = (...parts: readonly Uint8Array[]): Uint8Array => {
      const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
      let offset = 0;
      for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
      }
      return out;
    };

    const splitA = { first: Uint8Array.of(0xaa, 0xbb), second: Uint8Array.of(0xcc, 0xdd) };
    const splitB = { first: Uint8Array.of(0xaa, 0xbb, 0xcc), second: Uint8Array.of(0xdd) };

    // A raw, width-unaware concatenation cannot distinguish "2 bytes then 2 bytes" from "3 bytes
    // then 1 byte" — exactly the collision `fixed()`'s missing length check exposed.
    expect(rawConcat(splitA.first, splitA.second)).toEqual(rawConcat(splitB.first, splitB.second));

    // `fixed()` now requires both call sites to declare the same width for "the first field":
    // encoding `splitB` as if it were `splitA`'s shape (a 2-byte first field) is refused, because
    // `splitB.first` is 3 bytes.
    expect(() => new ByteWriter().fixed(splitA.first, 2).fixed(splitA.second, 2)).not.toThrow();
    expect(() => new ByteWriter().fixed(splitB.first, 2).fixed(splitB.second, 2)).toThrow(
      MalformedInputError,
    );
  });
});

describe('toHex and fromHex', () => {
  it('correctly converts between Uint8Array and hex string', () => {
    const bytes = new Uint8Array([0x00, 0x0f, 0x10, 0xaf, 0xff]);
    const hex = toHex(bytes);
    expect(hex).toBe('000f10afff');
    expect(fromHex(hex)).toEqual(bytes);
    expect(fromHex('000F10AFFF')).toEqual(bytes);
  });

  it('rejects invalid hex input', () => {
    expect(() => fromHex('abc')).toThrow(MalformedInputError); // odd length
    expect(() => fromHex('000g')).toThrow(MalformedInputError); // invalid char
    expect(() => fromHex('000Z')).toThrow(MalformedInputError);
  });
});

describe('ByteReader and ByteWriter', () => {
  it('correctly encodes and decodes u8, u32, u64, fixed, bytes, and string', () => {
    const writer = new ByteWriter();
    writer
      .u8(255)
      .u32(0x12345678)
      .u64(1234567890123)
      .fixed(new Uint8Array([1, 2, 3]), 3)
      .string('hello world');

    const encoded = writer.finish();
    const reader = new ByteReader(encoded);

    expect(reader.u8()).toBe(255);
    expect(reader.u32()).toBe(0x12345678);
    expect(reader.u64()).toBe(1234567890123);
    expect(reader.fixed(3)).toEqual(new Uint8Array([1, 2, 3]));
    expect(reader.string()).toBe('hello world');
    reader.end();
  });

  it('throws MalformedInputError on truncated reads', () => {
    const reader = new ByteReader(new Uint8Array([1, 2]));
    expect(reader.u8()).toBe(1);
    expect(reader.u8()).toBe(2);
    expect(() => reader.u8()).toThrow(MalformedInputError);
    expect(() => reader.u32()).toThrow(MalformedInputError);
  });
});

describe('compareUtf8Bytes', () => {
  it('handles string comparison and equality fast path', () => {
    const s = 'a_test_string_123';
    expect(compareUtf8Bytes(s, s)).toBe(0);
    expect(compareUtf8Bytes('alpha', 'alpha')).toBe(0);
    expect(compareUtf8Bytes('alpha', 'beta')).toBeLessThan(0);
    expect(compareUtf8Bytes('beta', 'alpha')).toBeGreaterThan(0);
  });
});

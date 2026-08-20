import { describe, expect, it } from 'vitest';

import { ByteWriter } from './codec.js';
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

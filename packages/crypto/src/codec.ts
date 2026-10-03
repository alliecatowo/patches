import { MalformedInputError } from './errors.js';

const MAX_FIELD_BYTES = 1 << 20;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

// Pre-allocated lookup tables for zero-allocation byte and hex operations
const U8_TABLE: readonly Uint8Array[] = Array.from(
  { length: 256 },
  (_, index) => new Uint8Array([index]),
);

const HEX_TABLE: readonly string[] = Array.from({ length: 256 }, (_, index) =>
  index.toString(16).padStart(2, '0'),
);

const HEX_MAP = new Int8Array(256).fill(-1);
for (let i = 0; i < 10; i += 1) HEX_MAP[48 + i] = i; // '0'-'9'
for (let i = 0; i < 6; i += 1) {
  HEX_MAP[97 + i] = 10 + i; // 'a'-'f'
  HEX_MAP[65 + i] = 10 + i; // 'A'-'F'
}

export class ByteWriter {
  readonly #chunks: Uint8Array[] = [];
  #length = 0;

  u8(value: number): this {
    if (!Number.isInteger(value) || value < 0 || value > 0xff) {
      throw new MalformedInputError('u8 out of range.');
    }
    // Optimization: reuse pre-allocated single-byte Uint8Array to avoid allocation per u8 write
    return this.#push(U8_TABLE[value]!);
  }

  u32(value: number): this {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
      throw new MalformedInputError('u32 out of range.');
    }
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value, false);
    return this.#push(bytes);
  }

  u64(value: number): this {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new MalformedInputError('u64 value is not a safe non-negative integer.');
    }
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setBigUint64(0, BigInt(value), false);
    return this.#push(bytes);
  }

  /**
   * Writes `value` with no length prefix — the field's width must be a build-time constant both
   * sides already agree on. `expectedBytes` is required (not inferred from `value.length`) so a
   * caller cannot silently narrow or widen a "fixed" field: doing so would make the surrounding
   * transcript non-injective, since a shorter/longer write here shifts every byte-offset a reader
   * downstream assumes for every later field (ADR 0024 B-055).
   */
  fixed(value: Uint8Array, expectedBytes: number): this {
    if (value.length !== expectedBytes) {
      throw new MalformedInputError(
        `Fixed field must be exactly ${String(expectedBytes)} bytes (got ${String(value.length)}).`,
      );
    }
    return this.#push(value);
  }

  bytes(value: Uint8Array): this {
    if (value.length > MAX_FIELD_BYTES) throw new MalformedInputError('Field exceeds byte limit.');
    return this.u32(value.length).#push(value);
  }

  string(value: string): this {
    return this.bytes(encoder.encode(value));
  }

  finish(): Uint8Array {
    const result = new Uint8Array(this.#length);
    let offset = 0;
    for (const chunk of this.#chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  #push(value: Uint8Array): this {
    this.#chunks.push(value);
    this.#length += value.length;
    return this;
  }
}

export class ByteReader {
  #offset = 0;
  readonly #view: DataView;

  constructor(private readonly source: Uint8Array) {
    // Optimization: create DataView once over source buffer slice to allow zero-allocation numeric reads
    this.#view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  }

  u8(): number {
    if (this.#offset + 1 > this.source.length) {
      throw new MalformedInputError('Truncated input.');
    }
    const value = this.source[this.#offset]!;
    this.#offset += 1;
    return value;
  }

  u32(): number {
    if (this.#offset + 4 > this.source.length) {
      throw new MalformedInputError('Truncated input.');
    }
    const value = this.#view.getUint32(this.#offset, false);
    this.#offset += 4;
    return value;
  }

  u64(): number {
    if (this.#offset + 8 > this.source.length) {
      throw new MalformedInputError('Truncated input.');
    }
    const result = this.#view.getBigUint64(this.#offset, false);
    if (result > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new MalformedInputError('u64 exceeds safe-integer range.');
    }
    this.#offset += 8;
    return Number(result);
  }

  fixed(length: number): Uint8Array {
    return this.#take(length);
  }

  bytes(): Uint8Array {
    const length = this.u32();
    if (length > MAX_FIELD_BYTES) throw new MalformedInputError('Field exceeds byte limit.');
    return this.#take(length);
  }

  string(): string {
    try {
      return decoder.decode(this.bytes());
    } catch {
      // TextDecoder exposes invalid UTF-8 only as TypeError; normalize it for callers.
      throw new MalformedInputError('Field is not valid UTF-8.');
    }
  }

  end(): void {
    if (this.#offset !== this.source.length) throw new MalformedInputError('Trailing bytes.');
  }

  #take(length: number): Uint8Array {
    if (!Number.isInteger(length) || length < 0 || this.#offset + length > this.source.length) {
      throw new MalformedInputError('Truncated input.');
    }
    const result = this.source.slice(this.#offset, this.#offset + length);
    this.#offset += length;
    return result;
  }
}

export function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

/**
 * Orders two strings by their UTF-8 byte sequences. Canonical encoders must never order with
 * `String.prototype.localeCompare`: its result depends on the host's ICU version and locale data,
 * so two clients encoding the same facts could disagree on ordering and produce different bytes
 * for one signature (ADR 0033 §2).
 */
export function compareUtf8Bytes(left: string, right: string): number {
  // Fast path: identical reference or primitive equality avoids encoding both strings
  if (left === right) return 0;
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const shared = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < shared; index += 1) {
    const difference = (leftBytes[index] ?? 0) - (rightBytes[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return leftBytes.length - rightBytes.length;
}

export function toHex(value: Uint8Array): string {
  // Optimization: use pre-allocated lookup table to eliminate Array.from allocations and per-byte formatting
  let hex = '';
  for (let index = 0; index < value.length; index += 1) {
    hex += HEX_TABLE[value[index]!]!;
  }
  return hex;
}

export function fromHex(value: string): Uint8Array {
  if (value.length % 2 !== 0) {
    throw new MalformedInputError('Hex input is malformed.');
  }
  const output = new Uint8Array(value.length / 2);
  // Optimization: lookup character codes directly in pre-allocated Int8Array to avoid string slicing and parseInt
  for (let index = 0; index < output.length; index += 1) {
    const high = HEX_MAP[value.charCodeAt(index * 2)] ?? -1;
    const low = HEX_MAP[value.charCodeAt(index * 2 + 1)] ?? -1;
    if (high === -1 || low === -1) {
      throw new MalformedInputError('Hex input is malformed.');
    }
    output[index] = (high << 4) | low;
  }
  return output;
}

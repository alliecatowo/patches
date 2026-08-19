import { MalformedInputError } from './errors.js';

const MAX_FIELD_BYTES = 1 << 20;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export class ByteWriter {
  readonly #chunks: Uint8Array[] = [];
  #length = 0;

  u8(value: number): this {
    if (!Number.isInteger(value) || value < 0 || value > 0xff) {
      throw new MalformedInputError('u8 out of range.');
    }
    return this.#push(Uint8Array.of(value));
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

  fixed(value: Uint8Array): this {
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

  constructor(private readonly source: Uint8Array) {}

  u8(): number {
    return this.#take(1)[0] ?? 0;
  }

  u32(): number {
    const value = this.#take(4);
    return new DataView(value.buffer, value.byteOffset, 4).getUint32(0, false);
  }

  u64(): number {
    const value = this.#take(8);
    const result = new DataView(value.buffer, value.byteOffset, 8).getBigUint64(0, false);
    if (result > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new MalformedInputError('u64 exceeds safe-integer range.');
    }
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

export function toHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function fromHex(value: string): Uint8Array {
  if (value.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(value)) {
    throw new MalformedInputError('Hex input is malformed.');
  }
  const output = new Uint8Array(value.length / 2);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return output;
}

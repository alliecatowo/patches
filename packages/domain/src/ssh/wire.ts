/**
 * The SSH binary wire encoding used by OpenSSH public keys and signature blobs
 * (RFC 4251 §5: a `string` is a `uint32` big-endian byte count followed by that many bytes).
 *
 * Implemented here rather than pulled from a library because it is thirty lines, it is the
 * *parsing* half of a security boundary, and every input reaching it is attacker-controlled —
 * a length prefix that claims more bytes than exist must be a rejection, never a truncated
 * read that silently succeeds.
 *
 * Lives in `@patches/domain` (spec §166, A-020) so `apps/server` and `apps/tui` share exactly
 * one definition of the encoding instead of two that could quietly drift apart.
 */

/** Length-prefixed `string` encoding of `value`. */
export function encodeSshString(value: Buffer | string): Buffer {
  const bytes = typeof value === 'string' ? Buffer.from(value, 'utf8') : value;
  const header = Buffer.alloc(4);
  header.writeUInt32BE(bytes.length, 0);
  return Buffer.concat([header, bytes]);
}

/** Concatenation of `encodeSshString` over every part, in order. */
export function encodeSshStrings(parts: readonly (Buffer | string)[]): Buffer {
  return Buffer.concat(parts.map((part) => encodeSshString(part)));
}

/** Thrown for any malformed input; callers turn it into a uniform authentication failure. */
export class SshWireError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SshWireError';
  }
}

/** A cursor over an SSH wire buffer. Every read is bounds-checked. */
export class SshReader {
  private offset = 0;

  constructor(private readonly buffer: Buffer) {}

  readString(): Buffer {
    if (this.offset + 4 > this.buffer.length) {
      throw new SshWireError('truncated ssh wire string header');
    }
    const length = this.buffer.readUInt32BE(this.offset);
    this.offset += 4;
    // Guards both a truncated buffer and a length so large it would overflow the addition.
    if (length > this.buffer.length - this.offset) {
      throw new SshWireError('ssh wire string length exceeds buffer');
    }
    const value = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  readUtf8String(): string {
    return this.readString().toString('utf8');
  }

  get atEnd(): boolean {
    return this.offset === this.buffer.length;
  }

  /** Rejects trailing bytes — a signature blob with extra data appended is malformed. */
  expectEnd(): void {
    if (!this.atEnd) throw new SshWireError('unexpected trailing bytes in ssh wire data');
  }
}

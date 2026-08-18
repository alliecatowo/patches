import { describe, expect, it } from 'vitest';

import { encodeSshString, encodeSshStrings, SshReader, SshWireError } from './wire.js';

describe('encodeSshString', () => {
  it('encodes a uint32 big-endian length prefix followed by the bytes', () => {
    const encoded = encodeSshString('hi');
    expect(encoded).toEqual(Buffer.from([0x00, 0x00, 0x00, 0x02, 0x68, 0x69]));
  });

  it('encodes an empty string as a zero-length prefix and no bytes', () => {
    expect(encodeSshString('')).toEqual(Buffer.from([0x00, 0x00, 0x00, 0x00]));
  });

  it('encodes a Buffer verbatim, without UTF-8 conversion', () => {
    const raw = Buffer.from([0xff, 0x00, 0x7f]);
    expect(encodeSshString(raw)).toEqual(Buffer.concat([Buffer.from([0, 0, 0, 3]), raw]));
  });
});

describe('encodeSshStrings', () => {
  it('concatenates each part’s encoding in order', () => {
    expect(encodeSshStrings(['a', 'bb'])).toEqual(
      Buffer.concat([encodeSshString('a'), encodeSshString('bb')]),
    );
  });

  it('returns an empty buffer for no parts', () => {
    expect(encodeSshStrings([])).toEqual(Buffer.alloc(0));
  });
});

describe('SshReader', () => {
  it('round-trips values written by encodeSshStrings', () => {
    const buffer = encodeSshStrings(['patches', Buffer.from([1, 2, 3]), 'trailer']);
    const reader = new SshReader(buffer);
    expect(reader.readUtf8String()).toBe('patches');
    expect(reader.readString()).toEqual(Buffer.from([1, 2, 3]));
    expect(reader.readUtf8String()).toBe('trailer');
    expect(reader.atEnd).toBe(true);
    expect(() => reader.expectEnd()).not.toThrow();
  });

  it('rejects a truncated length header', () => {
    const reader = new SshReader(Buffer.from([0x00, 0x00]));
    expect(() => reader.readString()).toThrow(SshWireError);
  });

  it('rejects a length claiming more bytes than exist', () => {
    const reader = new SshReader(Buffer.from([0x00, 0x00, 0x00, 0xff, 0x01]));
    expect(() => reader.readString()).toThrow(SshWireError);
  });

  it('rejects trailing bytes via expectEnd', () => {
    const reader = new SshReader(encodeSshString('a'));
    reader.readString();
    // Nothing left to read this time, so append a spare byte to force a mismatch.
    const withExtra = new SshReader(Buffer.concat([encodeSshString('a'), Buffer.from([0x01])]));
    withExtra.readString();
    expect(() => withExtra.expectEnd()).toThrow(SshWireError);
  });
});

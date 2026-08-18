import { describe, expect, it } from 'vitest';

import { diacritic } from './diacritics.js';
import {
  MAX_24BIT_IMAGE_ID,
  MAX_CHUNK_BASE64,
  PLACEHOLDER,
  buildGraphicsCommand,
  buildGraphicsCommandBase64,
  buildPlaceholderGrid,
  chunkTransmit,
  deleteAll,
  deleteImage,
  deleteRange,
  nextImageId,
  wrapTmuxPassthrough,
} from './kitty.js';

const ESC = '\x1b';

describe('buildGraphicsCommand', () => {
  it('emits an APC sequence with no payload separator when there is no payload', () => {
    expect(buildGraphicsCommand({ a: 'd', d: 'A', q: 2 })).toBe(`${ESC}_Ga=d,d=A,q=2${ESC}\\`);
  });

  it('base64-encodes the payload after a semicolon', () => {
    const payload = new Uint8Array([0, 0, 0]);
    expect(buildGraphicsCommand({ a: 'q', i: 31 }, payload)).toBe(`${ESC}_Ga=q,i=31;AAAA${ESC}\\`);
  });

  it('preserves control-key insertion order', () => {
    expect(buildGraphicsCommandBase64({ a: 'T', U: 1, i: 7, f: 100 })).toBe(
      `${ESC}_Ga=T,U=1,i=7,f=100${ESC}\\`,
    );
  });
});

describe('chunkTransmit', () => {
  // 3072 bytes -> exactly 4096 base64 characters, i.e. exactly one maximal chunk.
  const exactlyOneChunk = new Uint8Array(3072).fill(0x41);
  // 3075 bytes -> 4100 base64 characters: one full chunk plus a 4-character remainder.
  const justOverOneChunk = new Uint8Array(3075).fill(0x41);

  it('sends a single m=0 command when the payload fits one chunk', () => {
    const commands = chunkTransmit(new Uint8Array([1, 2, 3]), { id: 42, cols: 4, rows: 2 });
    expect(commands).toHaveLength(1);
    expect(commands[0]).toBe(`${ESC}_Ga=T,U=1,i=42,f=100,c=4,r=2,q=2,m=0;AQID${ESC}\\`);
  });

  it('puts every control key on the first chunk and only m,q on continuations', () => {
    const commands = chunkTransmit(justOverOneChunk, { id: 9, cols: 10, rows: 5 });
    expect(commands).toHaveLength(2);
    expect(commands[0]).toMatch(
      new RegExp(`^${ESC}_Ga=T,U=1,i=9,f=100,c=10,r=5,q=2,m=1;[A-Za-z0-9+/=]{4096}${ESC}\\\\$`),
    );
    expect(commands[1]).toMatch(new RegExp(`^${ESC}_Gm=0,q=2;[A-Za-z0-9+/=]{4}${ESC}\\\\$`));
  });

  it('breaks chunks at exactly 4096 base64 characters', () => {
    const commands = chunkTransmit(new Uint8Array(3072 * 2 + 3).fill(7), {
      id: 1,
      cols: 1,
      rows: 1,
    });
    expect(commands).toHaveLength(3);
    const payloads = commands.map((command) => command.split(';')[1]?.slice(0, -2) ?? '');
    expect(payloads[0]).toHaveLength(MAX_CHUNK_BASE64);
    expect(payloads[1]).toHaveLength(MAX_CHUNK_BASE64);
    expect(payloads[2]).toHaveLength(4);
    // Every chunk but the last must be a multiple of 4 (protocol requirement).
    expect(payloads.slice(0, -1).every((p) => p.length % 4 === 0)).toBe(true);
  });

  it('marks the final maximal chunk m=0 rather than emitting an empty trailer', () => {
    const commands = chunkTransmit(exactlyOneChunk, { id: 1, cols: 1, rows: 1 });
    expect(commands).toHaveLength(1);
    expect(commands[0]).toContain(',m=0;');
  });

  it('round-trips the payload across chunks', () => {
    const source = new Uint8Array(5000);
    for (let i = 0; i < source.length; i++) source[i] = i % 256;
    const commands = chunkTransmit(source, { id: 3, cols: 2, rows: 2 });
    const base64 = commands.map((c) => c.slice(c.indexOf(';') + 1, -2)).join('');
    expect(new Uint8Array(Buffer.from(base64, 'base64'))).toEqual(source);
  });

  it('omits U=1 when a real (non-virtual) placement is requested', () => {
    const [command] = chunkTransmit(new Uint8Array([1]), {
      id: 5,
      cols: 1,
      rows: 1,
      unicodePlaceholder: false,
    });
    expect(command).toContain('a=T,i=5');
    expect(command).not.toContain('U=1');
  });

  it('honours quiet and format overrides', () => {
    const [command] = chunkTransmit(new Uint8Array([1, 2, 3]), {
      id: 5,
      cols: 1,
      rows: 1,
      quiet: 1,
      format: 32,
    });
    expect(command).toContain('f=32');
    expect(command).toContain('q=1');
  });

  it('rejects invalid ids, geometry and empty payloads', () => {
    const bytes = new Uint8Array([1]);
    expect(() => chunkTransmit(bytes, { id: 0, cols: 1, rows: 1 })).toThrow(RangeError);
    expect(() => chunkTransmit(bytes, { id: 1, cols: 0, rows: 1 })).toThrow(RangeError);
    expect(() => chunkTransmit(bytes, { id: 1, cols: 1, rows: 0 })).toThrow(RangeError);
    expect(() => chunkTransmit(new Uint8Array(0), { id: 1, cols: 1, rows: 1 })).toThrow(RangeError);
  });
});

describe('delete commands', () => {
  it('deletes one image with the uppercase selector so the data is freed', () => {
    expect(deleteImage(4242)).toBe(`${ESC}_Ga=d,d=I,i=4242,q=2${ESC}\\`);
  });

  it('deletes everything', () => {
    expect(deleteAll()).toBe(`${ESC}_Ga=d,d=A,q=2${ESC}\\`);
  });

  it('deletes an id range', () => {
    expect(deleteRange(10, 20)).toBe(`${ESC}_Ga=d,d=R,x=10,y=20,q=2${ESC}\\`);
  });
});

describe('buildPlaceholderGrid', () => {
  it('reproduces the canonical 2x2 example from the protocol spec', () => {
    const [row0, row1] = buildPlaceholderGrid(42, 2, 2);
    const d0 = diacritic(0);
    const d1 = diacritic(1);
    expect(row0).toBe(
      `${ESC}[38;2;0;0;42m${PLACEHOLDER}${d0}${d0}${PLACEHOLDER}${d0}${d1}${ESC}[39m`,
    );
    expect(row1).toBe(
      `${ESC}[38;2;0;0;42m${PLACEHOLDER}${d1}${d0}${PLACEHOLDER}${d1}${d1}${ESC}[39m`,
    );
  });

  it('emits explicit row and column diacritics on every cell', () => {
    const [row] = buildPlaceholderGrid(1, 5, 1);
    const cells = row?.slice(`${ESC}[38;2;0;0;1m`.length, -`${ESC}[39m`.length) ?? '';
    // 5 cells x (placeholder + 2 combining marks) = 15 codepoints.
    expect([...cells]).toHaveLength(15);
    for (let col = 0; col < 5; col++) {
      expect(cells).toContain(PLACEHOLDER + diacritic(0) + diacritic(col));
    }
  });

  it('splits a 24-bit id across the RGB channels', () => {
    const id = (0x12 << 16) | (0x34 << 8) | 0x56;
    expect(buildPlaceholderGrid(id, 1, 1)[0]).toContain(`${ESC}[38;2;18;52;86m`);
  });

  it('adds a third diacritic for the most significant byte of a >24-bit id', () => {
    const id = 42 + (2 << 24); // 33554474, the spec's own worked example
    const [row] = buildPlaceholderGrid(id, 1, 1);
    expect(row).toBe(
      `${ESC}[38;2;0;0;42m${PLACEHOLDER}${diacritic(0)}${diacritic(0)}${diacritic(2)}${ESC}[39m`,
    );
  });

  it('omits the third diacritic for 24-bit ids', () => {
    const [row] = buildPlaceholderGrid(MAX_24BIT_IMAGE_ID, 1, 1);
    expect(row).toBe(
      `${ESC}[38;2;255;255;255m${PLACEHOLDER}${diacritic(0)}${diacritic(0)}${ESC}[39m`,
    );
  });

  it('returns one string per row, each opening and closing its own colour run', () => {
    const grid = buildPlaceholderGrid(7, 3, 4);
    expect(grid).toHaveLength(4);
    for (const row of grid) {
      expect(row.startsWith(`${ESC}[38;2;0;0;7m`)).toBe(true);
      expect(row.endsWith(`${ESC}[39m`)).toBe(true);
    }
  });

  it('rejects grids larger than the diacritic table can address', () => {
    expect(() => buildPlaceholderGrid(1, 298, 1)).toThrow(RangeError);
    expect(() => buildPlaceholderGrid(1, 1, 298)).toThrow(RangeError);
    expect(() => buildPlaceholderGrid(0, 1, 1)).toThrow(RangeError);
  });
});

describe('nextImageId', () => {
  it('always returns a non-zero 24-bit id', () => {
    for (let i = 0; i < 500; i++) {
      const id = nextImageId();
      expect(id).toBeGreaterThan(0);
      expect(id).toBeLessThanOrEqual(MAX_24BIT_IMAGE_ID);
      expect(Number.isInteger(id)).toBe(true);
    }
  });

  it('never returns an id that is already taken', () => {
    const taken = new Set([1, 2, 3]);
    for (let i = 0; i < 100; i++) expect(taken.has(nextImageId(taken))).toBe(false);
  });
});

describe('wrapTmuxPassthrough', () => {
  it('doubles every ESC and wraps in a DCS passthrough', () => {
    expect(wrapTmuxPassthrough(`${ESC}_Ga=d${ESC}\\`)).toBe(
      `${ESC}Ptmux;${ESC}${ESC}_Ga=d${ESC}${ESC}\\${ESC}\\`,
    );
  });
});

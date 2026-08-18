import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { InvalidAttachmentError, readLocalImage } from './validate.js';

// A minimal, structurally-valid 1x1 transparent PNG — enough to pass `sniffMimeType`'s
// magic-byte check without needing a real image encoder in this test.
const MINIMAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

describe('readLocalImage (P5-003, spec §28/§31)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'patches-media-validate-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('accepts a real PNG regardless of its file extension', async () => {
    const path = join(dir, 'photo.bin');
    await writeFile(path, MINIMAL_PNG);
    const local = await readLocalImage(path);
    expect(local.mimeType).toBe('image/png');
    expect(local.byteSize).toBe(MINIMAL_PNG.byteLength);
    expect(local.sha256).toHaveLength(64);
  });

  it('rejects a file whose magic bytes are not a supported format', async () => {
    const path = join(dir, 'not-an-image.txt');
    await writeFile(path, 'just some text');
    await expect(readLocalImage(path)).rejects.toThrow(InvalidAttachmentError);
  });

  it('rejects an empty file', async () => {
    const path = join(dir, 'empty.png');
    await writeFile(path, Buffer.alloc(0));
    await expect(readLocalImage(path)).rejects.toThrow(/empty/);
  });

  it('rejects a file that does not exist', async () => {
    await expect(readLocalImage(join(dir, 'nope.png'))).rejects.toThrow(/No such file/);
  });

  it('rejects a file over the size ceiling', async () => {
    const path = join(dir, 'huge.png');
    // 11 MB of PNG-signature-prefixed junk — over the 10 MB `MAX_INPUT_BYTES` ceiling.
    const huge = Buffer.concat([MINIMAL_PNG, Buffer.alloc(11 * 1024 * 1024)]);
    await writeFile(path, huge);
    await expect(readLocalImage(path)).rejects.toThrow(/larger than/);
  });
});

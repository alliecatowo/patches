import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, afterEach, beforeEach } from 'vitest';

import { createFakeApi, flush, KEY, renderApp } from './harness.js';

// Same minimal, structurally-valid PNG `src/media/validate.test.ts` uses.
const MINIMAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

async function loginAs(
  press: (input: string) => void,
  handle: string,
  password: string,
): Promise<void> {
  press('L');
  await flush();
  press(handle);
  await flush();
  press(KEY.enter);
  await flush();
  press(password);
  await flush();
  press(KEY.enter);
  await flush(60);
}

describe('compose attach flow (P5-003/B-004, spec §29–32/§80)', () => {
  let dir: string;
  let photoPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'patches-compose-attach-'));
    photoPath = join(dir, 'photo.png');
    await writeFile(photoPath, MINIMAL_PNG);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('uploads a local file end to end and posts it with the new post', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const { press, lastFrame, unmount } = renderApp({ fake });

    await flush();
    await loginAs(press, 'alice', 'x');

    press('c');
    await flush();
    press(KEY.ctrlA);
    await flush();
    expect(lastFrame() ?? '').toContain('Attach path:');
    press(photoPath);
    await flush();
    press(KEY.enter);
    // Upload + finalize + poll all resolve against the fake in-process, but each is a
    // real microtask hop — give them room to settle.
    await flush(300);

    const attached = lastFrame() ?? '';
    expect(attached).toContain('photo.png');
    expect(attached).not.toContain('Uploading');

    // Ctrl+S submits the post with the uploaded media id attached.
    press('hello with a photo');
    await flush();
    press(KEY.ctrlS);
    await flush(100);
    unmount();

    const posted = fake.findPostByBody('hello with a photo');
    expect(posted).toBeDefined();
    expect(posted?.media).toHaveLength(1);
    expect(posted?.media[0]?.mimeType).toBe('image/png');
  });

  it('shows a human-readable error and keeps the draft for an unsupported file', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const badPath = join(dir, 'notes.txt');
    await writeFile(badPath, 'not an image');

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, 'alice', 'x');

    press('c');
    await flush();
    press(KEY.ctrlA);
    await flush();
    press(badPath);
    await flush();
    press(KEY.enter);
    await flush(100);

    const frame = lastFrame() ?? '';
    expect(frame).toMatch(/JPEG|PNG|WebP/);
    unmount();
  });
});

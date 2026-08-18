import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, afterEach, beforeEach } from 'vitest';

import { createFakeApi, expectFrame, flush, KEY, renderApp, waitForFrame } from './harness.js';

// Same minimal, structurally-valid PNG `src/media/validate.test.ts` uses.
const MINIMAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

async function loginAs(
  press: (input: string) => void,
  lastFrame: () => string | undefined,
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
  // A fixed flush here isn't reliable: login resolves a real Promise chain
  // (loginWithPassword → applySession → setSession/setScreen) whose length can
  // occasionally outrun even a generous sleep — wait for the status bar's
  // '@handle' badge, which only renders once the session has actually committed.
  await expectFrame(lastFrame, `· @${handle}`);
  await flush();
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
    await loginAs(press, lastFrame, 'alice', 'x');

    press('c');
    await flush();
    press(KEY.ctrlA);
    await expectFrame(lastFrame, 'Attach path:');
    await flush();
    press(photoPath);
    await flush();
    press(KEY.enter);
    // Upload + finalize + poll all resolve against the fake in-process, but each is a
    // real microtask hop — poll for the attached filename rather than sleeping past them.
    // Wait on the attachment badge specifically, not bare 'photo.png' — the raw path
    // being typed above already contains that substring before Enter is even processed.
    const attached = await expectFrame(lastFrame, '[1] photo.png');
    expect(attached).not.toContain('Uploading');

    await flush();

    // Ctrl+S submits the post with the uploaded media id attached.
    press('hello with a photo');
    await flush();
    press(KEY.ctrlS);

    // Submitting navigates away from compose to the new post's author profile
    // (mirrors `screens.test.tsx`'s compose test) — wait for the post body to
    // land there instead of sleeping a fixed duration past the submit RPC.
    await expectFrame(lastFrame, 'hello with a photo');
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
    await loginAs(press, lastFrame, 'alice', 'x');

    press('c');
    await flush();
    press(KEY.ctrlA);
    await flush();
    press(badPath);
    await flush();
    press(KEY.enter);

    const frame = await waitForFrame(lastFrame, (f) => /JPEG|PNG|WebP/.test(f));
    expect(frame).toMatch(/JPEG|PNG|WebP/);
    unmount();
  });
});

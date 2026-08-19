import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, afterEach, beforeEach } from 'vitest';

import { createFakeApi, expectFrame, flush, KEY, renderApp, stripSgr } from './harness.js';

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

    // `C` is full compose (attachments, CW, quote); `c` is the quick-post overlay.
    press('C');
    await flush();
    press(KEY.ctrlA);
    await expectFrame(lastFrame, 'File picker');
    // The picker's initial directory resolution (`lstat` + `readdir`) is async and
    // republishes its path input when it settles, which can arrive after typing and
    // clobber it back to the home directory it started from — the status/hint rows
    // that would otherwise signal "loaded" can be clipped out of a small compose
    // region, so a flat wait is the reliable signal here, not a frame poll.
    await flush(150);
    // Ctrl+U clears the picker's browse-mode path buffer (it starts filled with the
    // home directory) before typing an exact path (P12-014).
    press(KEY.ctrlU);
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

    // `C` is full compose (attachments, CW, quote); `c` is the quick-post overlay.
    press('C');
    await flush();
    press('draft body kept');
    await flush();
    press(KEY.ctrlA);
    await expectFrame(lastFrame, 'File picker');
    // The picker's initial directory resolution (`lstat` + `readdir`) is async and
    // republishes its path input when it settles, which can arrive after typing and
    // clobber it back to the home directory it started from — the status/hint rows
    // that would otherwise signal "loaded" can be clipped out of a small compose
    // region, so a flat wait is the reliable signal here, not a frame poll.
    await flush(150);
    press(KEY.ctrlU);
    await flush();
    press(badPath);
    await flush();
    press(KEY.enter);

    // The picker's own MIME-type policy check rejects it before `onSelect` ever
    // fires — `readLocalImage`'s magic-byte sniff never runs for this file. Give the
    // (synchronous) validation a beat, then assert on the picker's own behaviour
    // rather than its inline error text, which a short content region can legally
    // clip out of view (§2.3's fixed-height frame) without the rejection itself
    // being any less real.
    await flush(150);
    const frame = stripSgr(lastFrame() ?? '');
    expect(frame).toContain('File picker'); // still open — never selected
    expect(frame).not.toContain('notes.txt]'); // never landed as an attachment badge
    // The draft body typed before the rejected attach attempt was never lost.
    expect(frame).toContain('draft body kept');
    unmount();
  });
});

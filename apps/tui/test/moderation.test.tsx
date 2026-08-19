import { describe, expect, it } from 'vitest';

import { createFakeApi, expectFrame, flush, KEY, renderApp, waitForFrame } from './harness.js';

/**
 * P4-004: minimal moderation UI — `B` block/unblock and `M` mute/unmute on a
 * profile (each behind a `y`/`n` confirm), and `!` report (post row or profile) —
 * against `FakeApiHandle`'s `ModerationService`.
 */

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

async function pressGo(press: (input: string) => void, letter: string): Promise<void> {
  press('g');
  await flush(60);
  press(letter);
  await flush(60);
}

describe('Moderation (P4-004)', () => {
  it('B block/unblock a profile behind the shared ConfirmDialog', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const bob = fake.addUser({ handle: 'bob', password: 'x', displayName: '', bio: '' });
    fake.addPost(bob.id, 'Bob post');

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame, 'alice', 'x');
    await pressGo(press, 'l');

    press('p'); // open bob's profile

    await expectFrame(lastFrame, 'B to block');

    await flush();

    press('B');

    // P12-126: the same measured `ConfirmDialog` every other destructive action uses.
    await expectFrame(lastFrame, 'Block @bob?');
    await expectFrame(lastFrame, '[y/n]');

    await flush();

    press('y');

    await expectFrame(lastFrame, 'B to unblock');
    unmount();
  });

  it('n cancels the confirm without blocking', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const bob = fake.addUser({ handle: 'bob', password: 'x', displayName: '', bio: '' });
    fake.addPost(bob.id, 'Bob post');

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame, 'alice', 'x');
    await pressGo(press, 'l');

    press('p'); // open bob's profile

    await expectFrame(lastFrame, 'M to mute');

    await flush();

    press('M');

    await expectFrame(lastFrame, 'y/n');

    await flush();

    press('n');

    // 'M to mute' is a persistent hint shown whether or not the confirm is
    // open, so wait on the confirm prompt actually disappearing rather than
    // on 'M to mute' — which was already present before the cancel.
    const frame = await waitForFrame(lastFrame, (f) => !f.includes('y/n'));
    expect(frame).toContain('M to mute');
    unmount();
  });

  it('! on a post row opens the report screen; Ctrl+S submits', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const bob = fake.addUser({ handle: 'bob', password: 'x', displayName: '', bio: '' });
    fake.addPost(bob.id, 'Bob spammy post');

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame, 'alice', 'x');
    await pressGo(press, 'l');

    press('!');

    const frame = await expectFrame(lastFrame, 'Report post');
    expect(frame).toContain('Spam');

    press(KEY.ctrlS);

    // P12-126: filing a report goes through the shared confirm too.
    await expectFrame(lastFrame, '[y/n]');
    await flush();
    press('y');

    await expectFrame(lastFrame, 'Report submitted');
    unmount();
  });
});

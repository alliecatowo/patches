import { describe, expect, it } from 'vitest';

import { createFakeApi, expectFrame, flush, KEY, renderApp } from './harness.js';

/**
 * P4-004: like/unlike (`l`), bookmark/unbookmark (`b`), and the bookmarks screen
 * (`g b`) — all optimistic (spec §79), against `FakeApiHandle`'s `ReactionService`.
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

describe('Reactions (P4-004)', () => {
  it('l likes then unlikes the selected post, updating the count immediately', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const bob = fake.addUser({ handle: 'bob', password: 'x', displayName: '', bio: '' });
    fake.addPost(bob.id, 'Bob post');

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame, 'alice', 'x');
    await pressGo(press, 'l');

    await expectFrame(lastFrame, '♡ 0');

    await flush();

    press('l');

    await expectFrame(lastFrame, '♥ 1');

    await flush();

    press('l');

    await expectFrame(lastFrame, '♡ 0');
    unmount();
  });

  it('b bookmarks the selected post, and it shows up under g b', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const bob = fake.addUser({ handle: 'bob', password: 'x', displayName: '', bio: '' });
    fake.addPost(bob.id, 'Bob post to bookmark');

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame, 'alice', 'x');
    await pressGo(press, 'l');

    press('b');

    await expectFrame(lastFrame, 'bookmarked');

    await pressGo(press, 'b');

    const frame = await expectFrame(lastFrame, 'Bookmarks');
    expect(frame).toContain('Bob post to bookmark');
    unmount();
  });

  it('g b requires a session', async () => {
    const fake = createFakeApi();
    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();

    await pressGo(press, 'b');

    await expectFrame(lastFrame, 'Log in first');
    unmount();
  });
});

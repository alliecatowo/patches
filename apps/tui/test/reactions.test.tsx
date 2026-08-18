import { describe, expect, it } from 'vitest';

import { createFakeApi, flush, KEY, renderApp } from './harness.js';

/**
 * P4-004: like/unlike (`l`), bookmark/unbookmark (`b`), and the bookmarks screen
 * (`g b`) — all optimistic (spec §79), against `FakeApiHandle`'s `ReactionService`.
 */

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
    await loginAs(press, 'alice', 'x');
    await pressGo(press, 'l');

    expect(lastFrame() ?? '').toContain('♡ 0');

    press('l');
    await flush(60);

    expect(lastFrame() ?? '').toContain('♥ 1');

    press('l');
    await flush(60);

    expect(lastFrame() ?? '').toContain('♡ 0');
    unmount();
  });

  it('b bookmarks the selected post, and it shows up under g b', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const bob = fake.addUser({ handle: 'bob', password: 'x', displayName: '', bio: '' });
    fake.addPost(bob.id, 'Bob post to bookmark');

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, 'alice', 'x');
    await pressGo(press, 'l');

    press('b');
    await flush(60);

    expect(lastFrame() ?? '').toContain('bookmarked');

    await pressGo(press, 'b');

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Bookmarks');
    expect(frame).toContain('Bob post to bookmark');
    unmount();
  });

  it('g b requires a session', async () => {
    const fake = createFakeApi();
    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();

    await pressGo(press, 'b');

    expect(lastFrame() ?? '').toContain('Log in first');
    unmount();
  });
});

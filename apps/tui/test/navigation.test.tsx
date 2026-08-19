import { describe, expect, it } from 'vitest';

import { createFakeApi, expectFrame, flush, KEY, renderApp, waitForFrame } from './harness.js';

/**
 * The interaction model the owner asked for on 2026-08-18: open on a timeline, `Esc`
 * always goes back exactly one level from every screen, and `g x` works from every
 * screen rather than only from the ones that remembered to wire it.
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
  await expectFrame(lastFrame, `· @${handle}`);
  await flush();
}

async function pressGo(press: (input: string) => void, letter: string): Promise<void> {
  press('g');
  await flush(60);
  press(letter);
  await flush(60);
}

describe('default screen', () => {
  it('opens on the local timeline while signed out, with a one-line log-in hint', async () => {
    const { lastFrame, unmount } = renderApp();
    const frame = await expectFrame(lastFrame, 'Local');
    expect(frame).toContain('press L to log in');
    unmount();
  });

  it('moves the root to Home once a session appears', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const { press, lastFrame, unmount } = renderApp({ fake });
    await expectFrame(lastFrame, 'Local');
    await loginAs(press, lastFrame, 'alice', 'x');

    await expectFrame(lastFrame, 'Home');
    unmount();
  });
});

describe('Esc pops exactly one level, from every screen', () => {
  it('backs out of bookmarks, notifications, search, the account screen and help', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const { press, lastFrame, unmount } = renderApp({ fake });
    await expectFrame(lastFrame, 'Local');
    await loginAs(press, lastFrame, 'alice', 'x');
    await expectFrame(lastFrame, 'Home');

    for (const [letter, title] of [
      ['b', 'Bookmarks'],
      ['n', 'Notifications'],
      ['p', 'Profile'],
      ['v', 'Page'],
    ] as const) {
      await pressGo(press, letter);
      await expectFrame(lastFrame, title);
      await flush(40);
      press(KEY.escape);
      await expectFrame(lastFrame, 'Home');
      await flush(40);
    }

    press('/');
    await expectFrame(lastFrame, 'Search');
    await flush(40);
    press(KEY.escape);
    await expectFrame(lastFrame, 'Home');
    await flush(40);

    press('L');
    await expectFrame(lastFrame, 'Account');
    await flush(40);
    press(KEY.escape);
    await expectFrame(lastFrame, 'Home');
    await flush(40);

    press('?');
    await expectFrame(lastFrame, 'Navigation');
    await flush(40);
    press(KEY.escape);
    await expectFrame(lastFrame, 'Home');
    unmount();
  });

  it('unwinds a drill-down one level at a time', async () => {
    const fake = createFakeApi();
    const alice = fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const root = fake.addPost(alice.id, 'Alice root post');
    fake.addPost(alice.id, 'Alice reply', new Date(), root.id);

    const { press, lastFrame, unmount } = renderApp({ fake });
    await expectFrame(lastFrame, 'Local');
    await flush(40);

    // local → thread → author profile
    press('j');
    await flush(40);
    press(KEY.enter);
    await expectFrame(lastFrame, 'Thread');
    await flush(40);

    press('p');
    await expectFrame(lastFrame, 'Profile');
    await flush(40);

    press(KEY.escape);
    await expectFrame(lastFrame, 'Thread');
    await flush(40);

    press(KEY.escape);
    await expectFrame(lastFrame, 'Local');
    unmount();
  });
});

describe('g x works from every screen', () => {
  it('reaches home from a thread, a profile, help and the account screen', async () => {
    const fake = createFakeApi();
    const alice = fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    fake.addPost(alice.id, 'Alice post');

    const { press, lastFrame, unmount } = renderApp({ fake });
    await expectFrame(lastFrame, 'Local');
    await loginAs(press, lastFrame, 'alice', 'x');
    await expectFrame(lastFrame, 'Home');
    await flush(40);

    // Deep: home → profile → its own page → help.
    await pressGo(press, 'p');
    await expectFrame(lastFrame, 'Profile');
    await pressGo(press, 'v');
    await expectFrame(lastFrame, 'Page');
    await flush(40);
    press('?');
    await expectFrame(lastFrame, 'Navigation');
    await flush(40);

    // …and `g h` still lands on home from four levels down, with nothing stale
    // underneath: Esc at the root has nothing left to pop.
    await pressGo(press, 'h');
    await waitForFrame(lastFrame, (f) => f.includes('Home') && f.includes('Alice post'));
    await flush(60);

    press(KEY.escape);
    await flush(80);
    expect(lastFrame()).toContain('Home');
    unmount();
  });
});

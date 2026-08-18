import { describe, expect, it } from 'vitest';

import { createFakeApi, expectFrame, flush, KEY, renderApp, waitForFrame } from './harness.js';

/**
 * P3-003: snapshot coverage for the Home feed (`ListHomeFeed`), Search
 * (`SearchActors`), and follow/unfollow (`FollowActor`/`UnfollowActor`/
 * `GetRelationship`) — all against the fake API, same pattern as
 * `test/screens.test.tsx`.
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

/** Same margin as `loginAs` for a `g <letter>` sequence — see its comment. */
async function pressGo(press: (input: string) => void, letter: string): Promise<void> {
  press('g');
  await flush(60);
  press(letter);
  await flush(60);
}

describe('Home feed (P3-003)', () => {
  it("shows the caller's own posts and posts from actors they follow, not everyone", async () => {
    const fake = createFakeApi();
    const alice = fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const bob = fake.addUser({ handle: 'bob', password: 'x', displayName: '', bio: '' });
    const carol = fake.addUser({ handle: 'carol', password: 'x', displayName: '', bio: '' });
    fake.addPost(alice.id, 'Alice own post');
    fake.addPost(bob.id, 'Bob post (followed)');
    fake.addPost(carol.id, 'Carol post (not followed)');
    fake.addFollow(alice.id, bob.id);

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame, 'alice', 'x');

    await pressGo(press, 'h');

    const frame = await expectFrame(lastFrame, 'Alice own post');
    expect(frame).toContain('Bob post (followed)');
    expect(frame).not.toContain('Carol post (not followed)');
    unmount();
  });

  it('requires a session — "g h" while logged out shows a notice, not the feed', async () => {
    const fake = createFakeApi();
    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();

    await pressGo(press, 'h');

    await expectFrame(lastFrame, 'Log in first');
    unmount();
  });
});

describe('Search (P3-003)', () => {
  it('/ → type a query → Enter searches → Enter on a result opens that profile', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    fake.addUser({ handle: 'bob', password: 'x', displayName: '', bio: 'Bob the builder' });

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();

    press('/');
    await flush();
    press('bob');
    await flush();
    press(KEY.enter);

    await expectFrame(lastFrame, '@bob');

    await flush();

    press(KEY.enter);

    await expectFrame(lastFrame, 'Bob the builder');
    unmount();
  });

  it('shows "No matches." for a query that finds nobody', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();

    press('/');
    await flush();
    press('nobody-with-this-handle');
    await flush();
    press(KEY.enter);

    await expectFrame(lastFrame, 'No matches.');
    unmount();
  });
});

describe('Follow control (P3-003)', () => {
  it('f follows, then unfollows, updating the relationship line', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const bob = fake.addUser({ handle: 'bob', password: 'x', displayName: '', bio: '' });
    fake.addPost(bob.id, 'Bob post');

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame, 'alice', 'x');

    // Open bob's profile from the local feed (`p` — `Enter` opens the thread since P4-004).
    await pressGo(press, 'l');
    press('p');

    await expectFrame(lastFrame, 'not following');

    await flush();

    press('f');

    // 'not following' contains 'following' as a substring, so wait for the
    // negative case explicitly rather than a plain `includes('following')`.
    await waitForFrame(lastFrame, (f) => f.includes('following') && !f.includes('not following'));

    await flush();

    press('f');

    await expectFrame(lastFrame, 'not following');
    unmount();
  });

  it("shows no follow control on the caller's own profile", async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame, 'alice', 'x');

    await pressGo(press, 'p');

    // Wait on the counts line settling (own-profile fetch) — follow-control phrases
    // never appear for the caller's own profile, so there's nothing to poll for there.
    // Not `.not.toContain('following')` — the counts line ("0 following") always has
    // that substring; assert the follow-control phrases specifically instead.
    const frame = await expectFrame(lastFrame, '0 following');
    expect(frame).not.toContain('not following');
    expect(frame).not.toContain('f to follow');
    expect(frame).not.toContain('f to unfollow');
    unmount();
  });
});

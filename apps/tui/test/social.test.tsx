import { describe, expect, it } from 'vitest';

import { createFakeApi, flush, KEY, renderApp } from './harness.js';

/**
 * P3-003: snapshot coverage for the Home feed (`ListHomeFeed`), Search
 * (`SearchActors`), and follow/unfollow (`FollowActor`/`UnfollowActor`/
 * `GetRelationship`) — all against the fake API, same pattern as
 * `test/screens.test.tsx`.
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
  // A slightly more generous flush: this resolves a real Promise chain
  // (loginWithPassword → applySession → setSession/setScreen) before the next
  // press. `vitest.config.ts`'s `fileParallelism: false` is what actually fixed
  // this project's flakiness under load (see its comment); this is just cheap
  // extra headroom for a chain with more hops than most.
  await flush(60);
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
    await loginAs(press, 'alice', 'x');

    await pressGo(press, 'h');

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Alice own post');
    expect(frame).toContain('Bob post (followed)');
    expect(frame).not.toContain('Carol post (not followed)');
    unmount();
  });

  it('requires a session — "g h" while logged out shows a notice, not the feed', async () => {
    const fake = createFakeApi();
    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();

    await pressGo(press, 'h');

    expect(lastFrame() ?? '').toContain('Log in first');
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
    await flush();

    expect(lastFrame() ?? '').toContain('@bob');

    press(KEY.enter);
    await flush();

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Bob the builder');
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
    await flush();

    expect(lastFrame() ?? '').toContain('No matches.');
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
    await loginAs(press, 'alice', 'x');

    // Open bob's profile from the local feed (`p` — `Enter` opens the thread since P4-004).
    await pressGo(press, 'l');
    press('p');
    await flush();
    await flush(); // relationship fetch is a second async round trip

    expect(lastFrame() ?? '').toContain('not following');

    press('f');
    await flush();
    await flush();

    expect(lastFrame() ?? '').toContain('following');
    expect(lastFrame() ?? '').not.toContain('not following');

    press('f');
    await flush();
    await flush();

    expect(lastFrame() ?? '').toContain('not following');
    unmount();
  });

  it("shows no follow control on the caller's own profile", async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, 'alice', 'x');

    await pressGo(press, 'p');

    // Not `.not.toContain('following')` — the counts line ("0 following") always has
    // that substring; assert the follow-control phrases specifically instead.
    const frame = lastFrame() ?? '';
    expect(frame).not.toContain('not following');
    expect(frame).not.toContain('f to follow');
    expect(frame).not.toContain('f to unfollow');
    unmount();
  });
});

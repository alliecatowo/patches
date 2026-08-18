import { describe, expect, it } from 'vitest';

import { createFakeApi, flush, KEY, renderApp } from './harness.js';

/**
 * B-017: snapshot tests for the flows `connect.test.tsx`/`help.test.tsx` don't
 * cover — login, compose→profile, the profile header, local-feed pagination,
 * and `PostList` row selection/`Enter` (opening a post's author profile).
 *
 * `g <letter>` sequences get their own `flush()` between the two presses:
 * `App`'s `pendingGo` gate is read from a fresh render, and two `press()`
 * calls in the same tick can otherwise race the state update.
 */

describe('login flow (B-017)', () => {
  it('L → password fields → status bar shows @handle once signed in', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'hunter2', displayName: 'Alice', bio: '' });
    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();

    press('L');
    await flush();
    press('alice');
    await flush();
    press(KEY.enter);
    await flush();
    press('hunter2');
    await flush();
    press(KEY.enter);
    await flush();

    expect(lastFrame() ?? '').toContain('· @alice');
    unmount();
  });
});

describe('compose (B-017)', () => {
  it('a submitted post appears in the profile timeline', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'hunter2', displayName: 'Alice', bio: 'hi there' });
    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();

    press('L');
    await flush();
    press('alice');
    await flush();
    press(KEY.enter);
    await flush();
    press('hunter2');
    await flush();
    press(KEY.enter);
    await flush();

    press('c');
    await flush();
    press('Hello world');
    await flush();
    press(KEY.ctrlS);
    await flush();
    // Navigation to the profile screen happens immediately on submit; its post
    // timeline (`listActorPosts`) is a separate async fetch that needs another tick.
    await flush();

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Hello world');
    expect(frame).toContain('@alice');
    unmount();
  });
});

describe('profile screen (B-017)', () => {
  it('shows the bio and the counts line', async () => {
    const fake = createFakeApi();
    const alice = fake.addUser({
      handle: 'alice',
      password: 'x',
      displayName: 'Alice A',
      bio: 'Bio text here',
    });
    fake.addPost(alice.id, 'First post');
    fake.addPost(alice.id, 'Second post');
    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();

    press('L');
    await flush();
    press('alice');
    await flush();
    press(KEY.enter);
    await flush();
    press('x');
    await flush();
    press(KEY.enter);
    await flush();

    press('g');
    await flush();
    press('p');
    await flush();

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Alice A');
    expect(frame).toContain('Bio text here');
    expect(frame).toContain('2 posts · 0 followers · 0 following');
    unmount();
  });
});

describe('local feed pagination (B-017)', () => {
  it('load-more reaches the end of the timeline', async () => {
    const fake = createFakeApi({ pageSize: 2 });
    const alice = fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    fake.addPost(alice.id, 'Post 1');
    fake.addPost(alice.id, 'Post 2');
    fake.addPost(alice.id, 'Post 3');
    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();

    press('g');
    await flush();
    press('l');
    await flush();

    expect(lastFrame() ?? '').toContain('n / space for more');

    press('n');
    await flush();

    expect(lastFrame() ?? '').toContain('— end of the timeline —');
    unmount();
  });
});

describe('PostList selection (B-017)', () => {
  it("j/k moves the highlighted row and Enter opens that post's author profile", async () => {
    const fake = createFakeApi();
    const alice = fake.addUser({
      handle: 'alice',
      password: 'x',
      displayName: '',
      bio: 'Alice bio',
    });
    const bob = fake.addUser({ handle: 'bob', password: 'x', displayName: '', bio: 'Bob bio' });
    fake.addPost(alice.id, 'Alice post');
    fake.addPost(bob.id, 'Bob post'); // newest first: bob is row 0, alice is row 1

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();

    press('g');
    await flush();
    press('l');
    await flush();

    press('j');
    await flush();
    press(KEY.enter);
    await flush();

    const frame = lastFrame() ?? '';
    expect(frame).toContain('@alice');
    expect(frame).toContain('Alice bio');
    unmount();
  });

  it("Enter with no movement opens the first (newest) post's author profile", async () => {
    const fake = createFakeApi();
    const alice = fake.addUser({
      handle: 'alice',
      password: 'x',
      displayName: '',
      bio: 'Alice bio',
    });
    const bob = fake.addUser({ handle: 'bob', password: 'x', displayName: '', bio: 'Bob bio' });
    fake.addPost(alice.id, 'Alice post');
    fake.addPost(bob.id, 'Bob post'); // newest first: bob is row 0

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();

    press('g');
    await flush();
    press('l');
    await flush();

    press(KEY.enter);
    await flush();

    const frame = lastFrame() ?? '';
    expect(frame).toContain('@bob');
    expect(frame).toContain('Bob bio');
    unmount();
  });
});

import { describe, expect, it } from 'vitest';

import { createFakeApi, expectFrame, flush, KEY, renderApp, waitForFrame } from './harness.js';

/**
 * P4-004: thread screen (root context + direct replies, drill-down navigation)
 * and the reply flow (`r` → compose scoped to a target → the new post lands in
 * its own thread with the parent shown for context).
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

/** Same margin as `social.test.tsx`'s `pressGo` — `vitest.config.ts`'s
 * `fileParallelism: false` comment notes these sequences are timing-sensitive
 * under load; a bare `flush()` is not always enough. */
async function pressGo(press: (input: string) => void, letter: string): Promise<void> {
  press('g');
  await flush(60);
  press(letter);
  await flush(60);
}

describe('Thread screen (P4-004)', () => {
  it("Enter opens a post's thread, showing its direct replies", async () => {
    const fake = createFakeApi();
    const alice = fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const bob = fake.addUser({ handle: 'bob', password: 'x', displayName: '', bio: '' });
    const root = fake.addPost(alice.id, 'Alice root post');
    fake.addPost(bob.id, 'Bob reply', new Date(), root.id);

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();

    await pressGo(press, 'l');

    // Newest first: Bob's reply is row 0, Alice's root post is row 1.
    press('j');
    await flush();
    press(KEY.enter);

    const frame = await expectFrame(lastFrame, 'Thread');
    expect(frame).toContain('Alice root post');
    expect(frame).toContain('Bob reply');
    unmount();
  });

  it('r opens compose scoped to the selected post, and the reply lands in its own thread', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const bob = fake.addUser({ handle: 'bob', password: 'x', displayName: '', bio: '' });
    fake.addPost(bob.id, 'Bob root post');

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame, 'alice', 'x');

    await pressGo(press, 'l');

    press('r');

    let frame = await expectFrame(lastFrame, 'Reply');
    expect(frame).toContain('replying to @bob');

    press('Alice reply text');
    await flush();
    press(KEY.ctrlS);

    // The reply lands back in the thread of the post it answers — not in its own
    // thread, which left you able to reply only to yourself (owner feedback
    // 2026-08-18). Bob's root post and the new reply are both in the one list.
    frame = await waitForFrame(
      lastFrame,
      (f) => f.includes('Thread') && f.includes('Alice reply text'),
    );
    expect(frame).toContain('Bob root post');
    unmount();
  });

  it("drilling into a reply's own replies pushes the thread stack; Esc pops one level before leaving", async () => {
    const fake = createFakeApi();
    const alice = fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const bob = fake.addUser({ handle: 'bob', password: 'x', displayName: '', bio: '' });
    const carol = fake.addUser({ handle: 'carol', password: 'x', displayName: '', bio: '' });
    const root = fake.addPost(alice.id, 'Root post');
    const reply = fake.addPost(bob.id, 'Bob reply', new Date(), root.id);
    fake.addPost(carol.id, 'Carol nested reply', new Date(), reply.id);

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();

    await pressGo(press, 'l');

    // Newest first: Carol's nested reply (row 0), Bob's reply (row 1), Root post (row 2).
    press('j');
    await flush();
    press('j');
    await flush();
    press(KEY.enter);

    // 'Root post' (and every other post here) is already visible in the local
    // feed row list, so wait on the 'Thread' screen header instead, which only
    // renders once the navigation has actually happened.
    let frame = await expectFrame(lastFrame, 'Thread');
    expect(frame).toContain('Root post');
    expect(frame).toContain('Bob reply');
    expect(frame).not.toContain('Carol nested reply');

    await flush();

    // Select Bob's reply (row 1 of this thread's list: [Root post, Bob reply]) and drill in.
    press('j');
    await flush();
    press(KEY.enter);

    // Drilling in re-roots the thread on Bob's reply — its own parent (the root) is
    // row 0 of the same navigable list, so `k`/`↑` can still reach it.
    frame = await waitForFrame(
      lastFrame,
      (f) => f.includes('Carol nested reply') && f.includes('Bob reply'),
    );
    expect(frame).toContain('Root post');

    // Esc pops one level — back to the root's thread, not out of the thread screen.
    press(KEY.escape);

    // The screen header already says 'Thread' before this Esc (nested thread view),
    // and a transient 'Loading thread…' placeholder also lacks 'Carol nested reply' —
    // so wait for the settled content (Root post back) with Carol's reply gone,
    // not just the absence of one string that's also true mid-reload.
    frame = await waitForFrame(
      lastFrame,
      (f) => f.includes('Root post') && !f.includes('Carol nested reply'),
    );
    expect(frame).toContain('Thread');

    // Esc again leaves the thread screen entirely, back to Local.
    press(KEY.escape);

    frame = await expectFrame(lastFrame, 'Local');
    expect(frame).not.toContain('Thread');
    unmount();
  });
});

describe('Thread navigation (owner feedback 2026-08-18)', () => {
  it('the parent, the focused post and the replies are one list: ↑ reaches the parent, r replies to it', async () => {
    const fake = createFakeApi();
    const alice = fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const bob = fake.addUser({ handle: 'bob', password: 'x', displayName: '', bio: '' });
    const root = fake.addPost(alice.id, 'Alice root post');
    const reply = fake.addPost(bob.id, 'Bob reply', new Date(), root.id);
    fake.addPost(alice.id, 'Carol-ish nested', new Date(), reply.id);

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame, 'bob', 'x');

    await pressGo(press, 'l');

    // Open Bob's reply's thread directly: its parent (Alice's root) is row 0.
    press('j');
    await flush(60);
    press(KEY.enter);
    await waitForFrame(lastFrame, (f) => f.includes('Thread') && f.includes('Alice root post'));
    await flush(60);

    // Move down into the reply, then back up with the arrow key — the parent is
    // reachable, which it was not when it rendered outside the list.
    press(KEY.down);
    await flush(60);
    press(KEY.up);
    await flush(60);

    press('r');

    const frame = await expectFrame(lastFrame, 'replying to @alice');
    expect(frame).toContain('Reply');
    unmount();
  });
});

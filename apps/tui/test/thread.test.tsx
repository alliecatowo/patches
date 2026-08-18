import { describe, expect, it } from 'vitest';

import { createFakeApi, flush, KEY, renderApp } from './harness.js';

/**
 * P4-004: thread screen (root context + direct replies, drill-down navigation)
 * and the reply flow (`r` → compose scoped to a target → the new post lands in
 * its own thread with the parent shown for context).
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
    await flush();
    await flush();

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Thread');
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
    await loginAs(press, 'alice', 'x');

    await pressGo(press, 'l');

    press('r');
    await flush(60);

    let frame = lastFrame() ?? '';
    expect(frame).toContain('Reply');
    expect(frame).toContain('replying to @bob');

    press('Alice reply text');
    await flush();
    press(KEY.ctrlS);
    await flush();
    await flush();

    frame = lastFrame() ?? '';
    expect(frame).toContain('Thread');
    expect(frame).toContain('in reply to');
    expect(frame).toContain('Bob root post');
    expect(frame).toContain('Alice reply text');
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
    await flush();
    await flush();

    let frame = lastFrame() ?? '';
    expect(frame).toContain('Root post');
    expect(frame).toContain('Bob reply');
    expect(frame).not.toContain('Carol nested reply');

    // Select Bob's reply (row 1 of this thread's list: [Root post, Bob reply]) and drill in.
    press('j');
    await flush();
    press(KEY.enter);
    await flush();
    await flush();

    frame = lastFrame() ?? '';
    expect(frame).toContain('in reply to');
    expect(frame).toContain('Root post');
    expect(frame).toContain('Bob reply');
    expect(frame).toContain('Carol nested reply');

    // Esc pops one level — back to the root's thread, not out of the thread screen.
    press(KEY.escape);
    await flush();
    await flush();

    frame = lastFrame() ?? '';
    expect(frame).toContain('Thread');
    expect(frame).toContain('Root post');
    expect(frame).not.toContain('Carol nested reply');

    // Esc again leaves the thread screen entirely, back to Local.
    press(KEY.escape);
    await flush(60);

    frame = lastFrame() ?? '';
    expect(frame).toContain('Local');
    expect(frame).not.toContain('Thread');
    unmount();
  });
});

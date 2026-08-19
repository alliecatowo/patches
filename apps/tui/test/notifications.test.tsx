import { NOTIFICATION_TYPE } from '@patches/proto';
import { describe, expect, it } from 'vitest';

import { createFakeApi, expectFrame, flush, KEY, renderApp, waitForFrame } from './harness.js';

/**
 * P4-004: notifications screen (`g n`) and the unread-count badge in the status
 * bar — against `FakeApiHandle`'s `NotificationService`.
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

describe('Notifications (P4-004)', () => {
  it('shows type/actor/relative-time, and an unread badge in the status bar', async () => {
    const fake = createFakeApi();
    const alice = fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const bob = fake.addUser({ handle: 'bob', password: 'x', displayName: '', bio: '' });
    fake.addNotification(alice.id, NOTIFICATION_TYPE.FOLLOW, { actorId: bob.id });

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame, 'alice', 'x');

    // `✉ N` is the ribbon's unread pill (P12-102) — no separate "N unread" wording.
    await expectFrame(lastFrame, '✉ 1');

    await pressGo(press, 'n');

    const frame = await expectFrame(lastFrame, 'Notifications');
    expect(frame).toContain('@bob');
    expect(frame).toContain('followed you');
    unmount();
  });

  it('m marks every loaded notification read, clearing the unread badge', async () => {
    const fake = createFakeApi();
    const alice = fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const bob = fake.addUser({ handle: 'bob', password: 'x', displayName: '', bio: '' });
    fake.addNotification(alice.id, NOTIFICATION_TYPE.FOLLOW, { actorId: bob.id });

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame, 'alice', 'x');
    await flush(60);
    await pressGo(press, 'n');

    press('m');

    // The ribbon's `✉ N` pill (P12-102) renders nothing once the count is 0.
    await waitForFrame(lastFrame, (f) => !f.includes('✉'));
    unmount();
  });

  it('Enter on a LIKE notification opens the related post thread', async () => {
    const fake = createFakeApi();
    const alice = fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const bob = fake.addUser({ handle: 'bob', password: 'x', displayName: '', bio: '' });
    const post = fake.addPost(alice.id, 'Alice liked-by-bob post');
    fake.addNotification(alice.id, NOTIFICATION_TYPE.LIKE, { actorId: bob.id, postId: post.id });

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame, 'alice', 'x');
    await pressGo(press, 'n');

    press(KEY.enter);

    const frame = await expectFrame(lastFrame, 'Thread');
    expect(frame).toContain('Alice liked-by-bob post');
    unmount();
  });
});

describe('Notifications mark themselves read as they are read (owner feedback 2026-08-18)', () => {
  it('clears the unread badge for the notifications on screen, without pressing m', async () => {
    const fake = createFakeApi();
    const alice = fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const bob = fake.addUser({ handle: 'bob', password: 'x', displayName: '', bio: '' });
    fake.addNotification(alice.id, NOTIFICATION_TYPE.FOLLOW, { actorId: bob.id });
    fake.addNotification(alice.id, NOTIFICATION_TYPE.LIKE, { actorId: bob.id });

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame, 'alice', 'x');
    // `✉ N` is the ribbon's unread pill (P12-102) — no separate "N unread" wording.
    await expectFrame(lastFrame, '✉ 2');

    await pressGo(press, 'n');
    await expectFrame(lastFrame, 'Notifications');

    // No `m`: just being on screen for the debounce is enough. The pill renders
    // nothing once the count is 0.
    await waitForFrame(lastFrame, (f) => !f.includes('✉'), 4000);
    unmount();
  });

  it('o opens a mention notification’s post, same as Enter', async () => {
    const fake = createFakeApi();
    const alice = fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const bob = fake.addUser({ handle: 'bob', password: 'x', displayName: '', bio: '' });
    const post = fake.addPost(bob.id, 'hey @alice look at this');
    fake.addNotification(alice.id, NOTIFICATION_TYPE.MENTION, { actorId: bob.id, postId: post.id });

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame, 'alice', 'x');
    await pressGo(press, 'n');
    await expectFrame(lastFrame, 'mentioned you');

    press('o');

    const frame = await expectFrame(lastFrame, 'Thread');
    // `@alice` is colour-highlighted mid-body, so assert on the surrounding runs.
    expect(frame).toContain('hey ');
    expect(frame).toContain('look at this');
    unmount();
  });
});

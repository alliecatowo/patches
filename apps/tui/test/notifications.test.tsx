import { NOTIFICATION_TYPE } from '@patches/proto';
import { describe, expect, it } from 'vitest';

import { createFakeApi, flush, KEY, renderApp } from './harness.js';

/**
 * P4-004: notifications screen (`g n`) and the unread-count badge in the status
 * bar — against `FakeApiHandle`'s `NotificationService`.
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

describe('Notifications (P4-004)', () => {
  it('shows type/actor/relative-time, and an unread badge in the status bar', async () => {
    const fake = createFakeApi();
    const alice = fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const bob = fake.addUser({ handle: 'bob', password: 'x', displayName: '', bio: '' });
    fake.addNotification(alice.id, NOTIFICATION_TYPE.FOLLOW, { actorId: bob.id });

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, 'alice', 'x');
    await flush(60); // useUnreadCount's first poll

    expect(lastFrame() ?? '').toContain('1 unread');

    await pressGo(press, 'n');

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Notifications');
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
    await loginAs(press, 'alice', 'x');
    await flush(60);
    await pressGo(press, 'n');

    press('m');
    await flush(60);

    const frame = lastFrame() ?? '';
    expect(frame).not.toContain('unread');
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
    await loginAs(press, 'alice', 'x');
    await pressGo(press, 'n');

    press(KEY.enter);
    await flush(60);

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Thread');
    expect(frame).toContain('Alice liked-by-bob post');
    unmount();
  });
});

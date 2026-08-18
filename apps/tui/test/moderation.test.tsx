import { describe, expect, it } from 'vitest';

import { createFakeApi, flush, KEY, renderApp } from './harness.js';

/**
 * P4-004: minimal moderation UI — `B` block/unblock and `M` mute/unmute on a
 * profile (each behind a `y`/`n` confirm), and `!` report (post row or profile) —
 * against `FakeApiHandle`'s `ModerationService`.
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

describe('Moderation (P4-004)', () => {
  it('B block/unblock a profile behind a y/n confirm', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const bob = fake.addUser({ handle: 'bob', password: 'x', displayName: '', bio: '' });
    fake.addPost(bob.id, 'Bob post');

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, 'alice', 'x');
    await pressGo(press, 'l');

    press('p'); // open bob's profile
    await flush(60);
    await flush(60); // relationship fetch

    expect(lastFrame() ?? '').toContain('B to block');

    press('B');
    await flush();

    expect(lastFrame() ?? '').toContain('Block @bob? y/n');

    press('y');
    await flush(60);

    const frame = lastFrame() ?? '';
    expect(frame).toContain('B to unblock');
    unmount();
  });

  it('n cancels the confirm without blocking', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const bob = fake.addUser({ handle: 'bob', password: 'x', displayName: '', bio: '' });
    fake.addPost(bob.id, 'Bob post');

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, 'alice', 'x');
    await pressGo(press, 'l');

    press('p');
    await flush(60);
    await flush(60);

    press('M');
    await flush();
    press('n');
    await flush();

    const frame = lastFrame() ?? '';
    expect(frame).toContain('M to mute');
    expect(frame).not.toContain('y/n');
    unmount();
  });

  it('! on a post row opens the report screen; Ctrl+S submits', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const bob = fake.addUser({ handle: 'bob', password: 'x', displayName: '', bio: '' });
    fake.addPost(bob.id, 'Bob spammy post');

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, 'alice', 'x');
    await pressGo(press, 'l');

    press('!');
    await flush(60);

    let frame = lastFrame() ?? '';
    expect(frame).toContain('Report post');
    expect(frame).toContain('Spam');

    press(KEY.ctrlS);
    await flush(60);

    frame = lastFrame() ?? '';
    expect(frame).toContain('Report submitted');
    unmount();
  });
});

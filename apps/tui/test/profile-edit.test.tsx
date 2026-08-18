import { describe, expect, it } from 'vitest';

import { createFakeApi, expectFrame, flush, KEY, renderApp, waitForFrame } from './harness.js';

/**
 * A-027 (in-app profile editing) / A-028 (email verification's `AccountsScreen`
 * surface — the code-entry itself is CLI-only, see `src/cli/verify.test.ts`).
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

describe('Edit profile (A-027)', () => {
  it('e -> edit fields -> Ctrl+S saves, and the profile shows the new values', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: 'Ann', bio: 'old bio' });

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, 'alice', 'x');
    await pressGo(press, 'p');
    await expectFrame(lastFrame, 'old bio');

    press('e');
    await expectFrame(lastFrame, 'Edit profile');

    // Clears the seeded display name (focus starts on the first field) and types a
    // new one.
    for (let index = 0; index < 'Ann'.length; index += 1) press(KEY.backspace);
    press('Annie');
    await flush();
    press(KEY.ctrlS);

    const frame = await waitForFrame(
      lastFrame,
      (text) => !text.includes('Edit profile') && text.includes('Annie'),
    );
    expect(frame).toContain('@alice');
    unmount();
  });

  it('Tab moves to bio (multi-line) so it can be edited independently of the display name', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'dana', password: 'x', displayName: 'Dana', bio: 'short' });

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, 'dana', 'x');
    await pressGo(press, 'p');
    await expectFrame(lastFrame, 'short');

    press('e');
    await expectFrame(lastFrame, 'Edit profile');
    press(KEY.tab);
    await flush();
    press(' plus more');
    await flush();
    press(KEY.ctrlS);

    const frame = await waitForFrame(
      lastFrame,
      (text) => !text.includes('Edit profile') && text.includes('short plus more'),
    );
    // The display name was never touched despite being focused first.
    expect(frame).toContain('Dana');
    unmount();
  });

  it('Esc discards every edit, leaving the profile unchanged', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'bob', password: 'x', displayName: 'Bob', bio: 'bobs bio' });

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, 'bob', 'x');
    await pressGo(press, 'p');
    await expectFrame(lastFrame, 'bobs bio');

    press('e');
    await expectFrame(lastFrame, 'Edit profile');
    press('XXXXX');
    await flush();
    press(KEY.escape);

    const frame = await waitForFrame(lastFrame, (text) => !text.includes('Edit profile'));
    expect(frame).toContain('bobs bio');
    expect(frame).not.toContain('XXXXX');
    unmount();
  });

  it("e has no effect on another actor's profile", async () => {
    const fake = createFakeApi();
    const alice = fake.addUser({ handle: 'alice', password: 'x', displayName: 'Alice', bio: '' });
    const carol = fake.addUser({ handle: 'carol', password: 'y', displayName: 'Carol', bio: '' });
    fake.addPost(carol.id, "carol's only post");
    void alice;

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, 'alice', 'x');
    await pressGo(press, 'l');
    await expectFrame(lastFrame, "carol's only post");

    press('p'); // open the selected row's author profile — carol, not alice
    await expectFrame(lastFrame, '@carol');

    press('e');
    await flush();
    expect(lastFrame() ?? '').not.toContain('Edit profile');
    unmount();
  });
});

describe('Email verification banner (A-028)', () => {
  it('shows an unverified banner and r resends, when signed in unverified', async () => {
    const fake = createFakeApi();
    fake.addUser({
      handle: 'eve',
      password: 'x',
      displayName: 'Eve',
      bio: '',
      emailVerified: false,
    });

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, 'eve', 'x');

    press('L');
    const frame = await expectFrame(lastFrame, 'email unverified');
    expect(frame).toContain('r resend');

    press('r');
    await expectFrame(lastFrame, 'Verification email sent.');
    expect(fake.resendVerificationCalls.length).toBe(1);
    unmount();
  });

  it('shows no banner once the account is verified', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'frank', password: 'x', displayName: 'Frank', bio: '' });

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, 'frank', 'x');

    press('L');
    const frame = await expectFrame(lastFrame, 'Account');
    expect(frame).not.toContain('email unverified');
    unmount();
  });
});

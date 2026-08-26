import { CREDENTIAL_TYPE } from '../src/api/wire/enums.js';
import { describe, expect, it } from 'vitest';

import { makeNameplate } from '../src/test/wire-fixtures.js';
import { createFakeApi, expectFrame, flush, KEY, renderApp, waitForFrame } from './harness.js';

/**
 * B-022: nameplate `avatarFrame`/`profileBorder` text-mode rendering, the plain-mode
 * toggle (`PATCHES_PLAIN=1`/runtime `P`) that strips all nameplate decoration, and the
 * in-app accounts screen (`L` when already signed in).
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

describe('Nameplate decoration (B-022)', () => {
  it('renders avatarFrame as a bracket marker and profileBorder as a box border', async () => {
    const fake = createFakeApi();
    fake.addUser({
      handle: 'alice',
      password: 'x',
      displayName: 'Alice',
      bio: '',
      nameplate: makeNameplate({
        nameColor: '#7C3AED',
        glyph: '★',
        badges: ['verified'],
        avatarFrame: 'gold',
        statusLine: 'building patches',
        profileBorder: 'round',
      }),
    });

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();

    press('/');
    await flush();
    press('alice');
    await flush();
    press(KEY.enter);
    await flush();
    press(KEY.enter);

    // The glyph renders inside the avatar-frame brackets (B-129): `‹ ★ Alice ›`.
    const frame = await expectFrame(lastFrame, '★ Alice');
    expect(frame).toContain('[verified]');
    expect(frame).toContain('building patches');
    expect(frame).toContain('╭'); // round border corner
    unmount();
  });
});

describe('Plain mode (B-022, spec §173)', () => {
  it('PATCHES_PLAIN=1 strips glyph, badges, avatar frame, and status line at startup', async () => {
    const fake = createFakeApi();
    fake.addUser({
      handle: 'alice',
      password: 'x',
      displayName: 'Alice',
      bio: '',
      nameplate: makeNameplate({
        nameColor: '#7C3AED',
        glyph: '★',
        badges: ['verified'],
        avatarFrame: 'gold',
        statusLine: 'building patches',
        profileBorder: 'round',
      }),
    });

    const { press, lastFrame, unmount } = renderApp({
      fake,
      env: { PATCHES_PLAIN: '1' },
    });
    await flush();

    press('/');
    await flush();
    press('alice');
    await flush();
    press(KEY.enter);
    await flush();
    press(KEY.enter);

    const frame = await expectFrame(lastFrame, '@alice');
    expect(frame).not.toContain('★');
    expect(frame).not.toContain('[verified]');
    expect(frame).not.toContain('‹ Alice ›');
    expect(frame).not.toContain('building patches');
    unmount();
  });

  it('P toggles plain mode at runtime', async () => {
    const fake = createFakeApi();
    const alice = fake.addUser({
      handle: 'alice',
      password: 'x',
      displayName: '',
      bio: '',
      nameplate: makeNameplate({
        nameColor: '#7C3AED',
        glyph: '★',
        badges: [],
        avatarFrame: '',
        statusLine: '',
        profileBorder: '',
      }),
    });
    fake.addPost(alice.id, 'hello world');

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();

    await pressGo(press, 'l');
    await expectFrame(lastFrame, '★');

    await flush();

    press('P');

    await waitForFrame(lastFrame, (f) => !f.includes('★'));

    await flush();

    press('P');

    await expectFrame(lastFrame, '★');
    unmount();
  });
});

describe('Accounts screen (B-022)', () => {
  it('L opens the accounts screen when already signed in, listing credentials', async () => {
    const fake = createFakeApi();
    const alice = fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    fake.addCredentialFor(alice.id, {
      type: CREDENTIAL_TYPE.PASSWORD,
      label: '',
      identifier: '',
    });

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame, 'alice', 'x');

    press('L');

    const frame = await expectFrame(lastFrame, 'Account');
    expect(frame).toContain('@alice');
    expect(frame).toContain('CREDENTIAL_TYPE_PASSWORD');
    unmount();
  });

  it('a with no SSH agent explains why, instead of hanging', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });

    const { press, lastFrame, unmount } = renderApp({ fake, env: {} });
    await flush();
    await loginAs(press, lastFrame, 'alice', 'x');

    press('L');
    await flush(60);
    press('a');

    await expectFrame(lastFrame, 'No SSH agent is running');
    unmount();
  });

  it('x logs out, returning to a logged-out state', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame, 'alice', 'x');

    press('L');
    await flush(60);
    press('x');

    await waitForFrame(lastFrame, (f) => !f.includes('@alice'));
    unmount();
  });

  it('v revokes the selected credential behind a y/n confirm (P15-007)', async () => {
    const fake = createFakeApi();
    const alice = fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    fake.addCredentialFor(alice.id, {
      type: CREDENTIAL_TYPE.PASSWORD,
      label: '',
      identifier: '',
    });
    fake.addCredentialFor(alice.id, {
      type: CREDENTIAL_TYPE.SSH_PUBLIC_KEY,
      label: 'laptop',
      identifier: 'SHA256:abc',
    });

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame, 'alice', 'x');

    press('L');
    await expectFrame(lastFrame, 'laptop');
    press('j'); // select the SSH key row
    await flush();
    press('v');
    await expectFrame(lastFrame, 'Revoke');
    press('y');

    const frame = await expectFrame(lastFrame, 'Revoked');
    expect(frame).toContain('Revoked CREDENTIAL_TYPE_SSH_PUBLIC_KEY');
    expect(frame).not.toContain('› CREDENTIAL_TYPE_SSH_PUBLIC_KEY');
    unmount();
  });

  it('n cancels a revoke confirm without calling the server', async () => {
    const fake = createFakeApi();
    const alice = fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    fake.addCredentialFor(alice.id, {
      type: CREDENTIAL_TYPE.PASSWORD,
      label: '',
      identifier: '',
    });
    fake.addCredentialFor(alice.id, {
      type: CREDENTIAL_TYPE.SSH_PUBLIC_KEY,
      label: 'laptop',
      identifier: 'SHA256:abc',
    });

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame, 'alice', 'x');

    press('L');
    await expectFrame(lastFrame, 'laptop');
    press('v');
    await expectFrame(lastFrame, 'Revoke');
    press('n');

    const frame = await expectFrame(lastFrame, 'laptop');
    expect(frame).not.toContain('Revoked');
    unmount();
  });

  it('revoking the only credential surfaces the server’s last-credential guard, not a crash', async () => {
    const fake = createFakeApi();
    const alice = fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    fake.addCredentialFor(alice.id, {
      type: CREDENTIAL_TYPE.PASSWORD,
      label: '',
      identifier: '',
    });

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame, 'alice', 'x');

    press('L');
    await expectFrame(lastFrame, 'CREDENTIAL_TYPE_PASSWORD');
    press('v');
    await expectFrame(lastFrame, 'Revoke');
    press('y');

    await expectFrame(lastFrame, 'This is your only way to sign in');
    unmount();
  });
});

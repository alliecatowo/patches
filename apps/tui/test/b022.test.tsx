import { CREDENTIAL_TYPE } from '@patches/proto';
import { describe, expect, it } from 'vitest';

import { createFakeApi, flush, KEY, renderApp } from './harness.js';

/**
 * B-022: nameplate `avatarFrame`/`profileBorder` text-mode rendering, the plain-mode
 * toggle (`PATCHES_PLAIN=1`/runtime `P`) that strips all nameplate decoration, and the
 * in-app accounts screen (`L` when already signed in).
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

describe('Nameplate decoration (B-022)', () => {
  it('renders avatarFrame as a bracket marker and profileBorder as a box border', async () => {
    const fake = createFakeApi();
    fake.addUser({
      handle: 'alice',
      password: 'x',
      displayName: 'Alice',
      bio: '',
      nameplate: {
        nameColor: '#7C3AED',
        glyph: '★',
        badges: ['verified'],
        avatarFrame: 'gold',
        statusLine: 'building patches',
        profileBorder: 'round',
      },
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
    await flush();

    const frame = lastFrame() ?? '';
    expect(frame).toContain('‹ Alice ›');
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
      nameplate: {
        nameColor: '#7C3AED',
        glyph: '★',
        badges: ['verified'],
        avatarFrame: 'gold',
        statusLine: 'building patches',
        profileBorder: 'round',
      },
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
    await flush();

    const frame = lastFrame() ?? '';
    expect(frame).toContain('@alice');
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
      nameplate: {
        nameColor: '#7C3AED',
        glyph: '★',
        badges: [],
        avatarFrame: '',
        statusLine: '',
        profileBorder: '',
      },
    });
    fake.addPost(alice.id, 'hello world');

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();

    await pressGo(press, 'l');
    expect(lastFrame() ?? '').toContain('★');

    press('P');
    await flush();

    expect(lastFrame() ?? '').not.toContain('★');

    press('P');
    await flush();

    expect(lastFrame() ?? '').toContain('★');
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
    await loginAs(press, 'alice', 'x');

    press('L');
    await flush(60);

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Account');
    expect(frame).toContain('@alice');
    expect(frame).toContain('CREDENTIAL_TYPE_PASSWORD');
    unmount();
  });

  it('a with no SSH agent explains why, instead of hanging', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });

    const { press, lastFrame, unmount } = renderApp({ fake, env: {} });
    await flush();
    await loginAs(press, 'alice', 'x');

    press('L');
    await flush(60);
    press('a');
    await flush(60);

    expect(lastFrame() ?? '').toContain('No SSH agent is running');
    unmount();
  });

  it('x logs out, returning to a logged-out state', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, 'alice', 'x');

    press('L');
    await flush(60);
    press('x');
    await flush(60);

    const frame = lastFrame() ?? '';
    expect(frame).not.toContain('@alice');
    unmount();
  });
});

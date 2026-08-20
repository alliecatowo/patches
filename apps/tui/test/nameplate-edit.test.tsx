import { describe, expect, it } from 'vitest';

import { createFakeApi, expectFrame, flush, KEY, renderApp, waitForFrame } from './harness.js';

/**
 * A-037 (nameplate editing) — extends `EditProfileScreen`'s A-027 fields with a
 * "Nameplate" section: name colour, glyph, status line, avatar frame, profile
 * border, all sent under a single `"nameplate"` mask path (spec §173).
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

describe('Edit profile — nameplate (A-037)', () => {
  it('e -> Tab to Name colour/Glyph -> Ctrl+S saves, and the profile shows the glyph', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: 'Ann', bio: '' });

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, 'alice', 'x');
    await pressGo(press, 'p');
    await expectFrame(lastFrame, '@alice');

    press('e');
    await expectFrame(lastFrame, 'Nameplate');

    // Focus order is displayName, bio, location, website, then the five nameplate
    // fields — four Tabs from the first field lands on "Name colour", which is
    // colour-picker-only editing (P12-015 wiring): Enter opens it, Tab moves to its
    // hex field, Enter there commits and closes the picker back onto the same field.
    for (let index = 0; index < 4; index += 1) press(KEY.tab);
    await flush();
    press(KEY.enter);
    await expectFrame(lastFrame, 'Color picker');
    press(KEY.tab);
    await flush();
    press('#00ff00');
    await flush();
    press(KEY.enter);
    await expectFrame(lastFrame, '#00ff00');

    press(KEY.tab); // -> Glyph
    await flush();
    press('*');
    await flush();
    // The live preview updates before saving.
    await expectFrame(lastFrame, '* @alice');

    press(KEY.ctrlS);

    const frame = await waitForFrame(
      lastFrame,
      (text) => !text.includes('Edit profile') && text.includes('* @alice'),
    );
    expect(frame).toContain('@alice');
    unmount();
  });

  it('editing only the glyph keeps the other nameplate fields (a merged submessage write)', async () => {
    const fake = createFakeApi();
    fake.addUser({
      handle: 'dana',
      password: 'x',
      displayName: 'Dana',
      bio: '',
      nameplate: {
        $typeName: 'patches.v1.Nameplate',
        nameColor: '#111111',
        glyph: '',
        badges: [],
        avatarFrame: '',
        statusLine: 'building patches',
        profileBorder: '',
      },
    });

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, 'dana', 'x');
    await pressGo(press, 'p');
    await expectFrame(lastFrame, 'building patches');

    press('e');
    await expectFrame(lastFrame, 'Nameplate');

    // -> Glyph directly (skip Name colour).
    for (let index = 0; index < 5; index += 1) press(KEY.tab);
    await flush();
    press('★');
    await flush();
    press(KEY.ctrlS);

    const frame = await waitForFrame(
      lastFrame,
      (text) => !text.includes('Edit profile') && text.includes('★'),
    );
    // The status line set before this edit survives — the whole nameplate
    // submessage was re-sent with its other fields unchanged, not blanked.
    expect(frame).toContain('building patches');
    unmount();
  });

  it('Esc discards a nameplate edit, leaving the profile unchanged', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'bob', password: 'x', displayName: 'Bob', bio: '' });

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, 'bob', 'x');
    await pressGo(press, 'p');
    await expectFrame(lastFrame, '@bob');

    press('e');
    await expectFrame(lastFrame, 'Nameplate');
    for (let index = 0; index < 5; index += 1) press(KEY.tab);
    await flush();
    press('Z');
    await flush();
    press(KEY.escape);

    const frame = await waitForFrame(lastFrame, (text) => !text.includes('Edit profile'));
    expect(frame).not.toContain('Z @bob');
    unmount();
  });
});

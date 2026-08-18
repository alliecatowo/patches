import { describe, expect, it } from 'vitest';

import { expectFrame, flush, renderApp } from './harness.js';

describe('help screen (spec §69: keybindings must stay discoverable)', () => {
  it('toggles into the help screen with ? and back out again', async () => {
    const { press, lastFrame, unmount } = renderApp();
    await expectFrame(lastFrame, 'Connected to patches-test.');

    await flush();

    press('?');
    const frame = await expectFrame(lastFrame, 'toggle this help');
    expect(frame).toContain('quit Patches');

    await flush();

    press('?');
    await expectFrame(lastFrame, 'Connected to patches-test.');
    unmount();
  });
});

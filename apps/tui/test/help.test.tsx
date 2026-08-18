import { describe, expect, it } from 'vitest';

import { flush, renderApp } from './harness.js';

describe('help screen (spec §69: keybindings must stay discoverable)', () => {
  it('toggles into the help screen with ? and back out again', async () => {
    const { press, lastFrame, unmount } = renderApp();
    await flush();
    expect(lastFrame() ?? '').toContain('Connected to patches-test.');

    press('?');
    await flush();
    let frame = lastFrame() ?? '';
    expect(frame).toContain('toggle this help');
    expect(frame).toContain('quit Patches');

    press('?');
    await flush();
    frame = lastFrame() ?? '';
    expect(frame).toContain('Connected to patches-test.');
    unmount();
  });
});

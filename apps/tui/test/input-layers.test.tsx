import type { PatchesPage } from '@patches/domain';
import { describe, expect, it } from 'vitest';

import { createFakeApi, expectFrame, flush, KEY, renderApp } from './harness.js';

const CTRL_P = '\u0010';

async function loginAs(
  press: (input: string) => void,
  lastFrame: () => string | undefined,
): Promise<void> {
  press('L');
  await flush();
  press('alice');
  await flush();
  press(KEY.enter);
  await flush();
  press('x');
  await flush();
  press(KEY.enter);
  await expectFrame(lastFrame, '· @alice');
  await flush();
}

describe('shell safety keys through legacy input/sub-mode layers', () => {
  it('opens the palette from Page guestbook input and Esc closes one layer at a time', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const page: PatchesPage = {
      version: 1,
      pages: [{ slug: 'index', title: '', blocks: [{ type: 'Guestbook', limit: 20 }] }],
    };
    fake.addPage('alice', 'index', page);
    const { press, lastFrame, unmount } = renderApp({ fake });
    await loginAs(press, lastFrame);
    press('g');
    await flush();
    press('v');
    await expectFrame(lastFrame, 'No guestbook entries yet.');

    press('s');
    await expectFrame(lastFrame, 'Sign guestbook:');
    press('q');
    await expectFrame(lastFrame, 'Sign guestbook: q█');

    press(CTRL_P);
    await expectFrame(lastFrame, 'Enter run · Tab complete');
    press(KEY.escape);
    await expectFrame(lastFrame, 'Sign guestbook: q█');

    press(KEY.escape);
    const pageFrame = await expectFrame(lastFrame, 'No guestbook entries yet.');
    expect(pageFrame).toContain('Page');
    await flush();
    press(KEY.escape);
    await expectFrame(lastFrame, 'Home');
    unmount();
  });

  it(':q! confirms a live compose draft and Esc closes only the confirm', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const { press, lastFrame, unmount } = renderApp({ fake });
    await loginAs(press, lastFrame);
    press('c');
    await expectFrame(lastFrame, 'New Post');
    press('q');
    const draftFrame = await expectFrame(lastFrame, '1/5000');
    expect(draftFrame).toContain('\n q');

    press(CTRL_P);
    await expectFrame(lastFrame, 'Enter run · Tab complete');
    press('q!');
    press(KEY.enter);
    await expectFrame(lastFrame, 'Discard draft and quit?');
    expect(lastFrame()).toContain('[y/n]');

    press(KEY.escape);
    const compose = await expectFrame(lastFrame, 'New Post');
    expect(compose).toContain('\n q');
    unmount();
  });

  it('rejects :! in the notice row without closing the command UI', async () => {
    const { press, lastFrame, unmount } = renderApp();
    await expectFrame(lastFrame, 'Local');
    press(':');
    await expectFrame(lastFrame, 'Enter run · Tab complete');
    press('! ls');
    press(KEY.enter);
    const frame = await expectFrame(lastFrame, 'Shell commands are disabled');
    expect(frame).toContain('Enter run · Tab complete');
    unmount();
  });
});

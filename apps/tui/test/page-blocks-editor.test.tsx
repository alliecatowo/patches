import type { PatchesPage } from '@patches/domain';
import { describe, expect, it } from 'vitest';

import { createFakeApi, expectFrame, flush, KEY, renderApp, waitForFrame } from './harness.js';

/**
 * B-023 — the structured, block-by-block Pages editor (`E` on `PageScreen`), as
 * opposed to P45-006's raw-JSON `$EDITOR` round trip (`e`), which `apps/tui/test/
 * pages.test.tsx` already covers.
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
  await expectFrame(lastFrame, `· @${handle}`);
  await flush();
}

async function openOwnPage(press: (input: string) => void): Promise<void> {
  press('g');
  await flush();
  press('v');
  await flush(60);
}

async function openBlocksEditor(
  press: (input: string) => void,
  lastFrame: () => string | undefined,
): Promise<void> {
  press('E');
  await expectFrame(lastFrame, 'Edit blocks');
  await flush();
}

describe('Structured Pages block editor (B-023)', () => {
  it('edits a block’s field and saves via UpdatePage', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const doc: PatchesPage = {
      version: 1,
      pages: [{ slug: 'index', title: 'Home', blocks: [{ type: 'Text', body: 'hello' }] }],
    };
    fake.addPage('alice', 'index', doc);

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame, 'alice', 'x');
    await openOwnPage(press);
    await expectFrame(lastFrame, 'hello');

    await openBlocksEditor(press, lastFrame);
    await expectFrame(lastFrame, 'Text — hello');

    press(KEY.enter);
    await expectFrame(lastFrame, 'Body');
    for (let index = 0; index < 'hello'.length; index += 1) press(KEY.backspace);
    press('new body');
    await flush();
    press(KEY.ctrlS); // commit the field form
    await expectFrame(lastFrame, 'Text — new body');

    press(KEY.ctrlS); // save the whole document
    const frame = await waitForFrame(
      lastFrame,
      (text) => !text.includes('Edit blocks') && text.includes('new body'),
    );
    expect(frame).toContain('new body');
    unmount();
  });

  it('a adds a block via the type picker, appended after the selection', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const doc: PatchesPage = {
      version: 1,
      pages: [{ slug: 'index', title: 'Home', blocks: [{ type: 'Text', body: 'first' }] }],
    };
    fake.addPage('alice', 'index', doc);

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame, 'alice', 'x');
    await openOwnPage(press);
    await openBlocksEditor(press, lastFrame);

    press('a');
    await expectFrame(lastFrame, 'Add a block:');
    press(KEY.enter); // "Text" is the first/default selection
    await flush();
    const frame = await expectFrame(lastFrame, '(empty)');
    expect(frame).toContain('Text — first');

    press(KEY.ctrlS);
    await waitForFrame(lastFrame, (text) => !text.includes('Edit blocks'));
    unmount();
  });

  it('J/K reorders, and d/y deletes after a confirm (n cancels)', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const doc: PatchesPage = {
      version: 1,
      pages: [
        {
          slug: 'index',
          title: 'Home',
          blocks: [
            { type: 'Text', body: 'first' },
            { type: 'Text', body: 'second' },
          ],
        },
      ],
    };
    fake.addPage('alice', 'index', doc);

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame, 'alice', 'x');
    await openOwnPage(press);
    await openBlocksEditor(press, lastFrame);

    const beforeFrame = lastFrame() ?? '';
    expect(beforeFrame.indexOf('first')).toBeLessThan(beforeFrame.indexOf('second'));

    press('J'); // swap the selected (first) block down
    await flush();
    const afterSwap = lastFrame() ?? '';
    expect(afterSwap.indexOf('second')).toBeLessThan(afterSwap.indexOf('first'));

    press('d');
    await expectFrame(lastFrame, 'Delete this block? y/n');
    press('n');
    await flush();
    expect(lastFrame() ?? '').toContain('first');
    expect(lastFrame() ?? '').toContain('second');

    press('d');
    await expectFrame(lastFrame, 'Delete this block? y/n');
    press('y');
    await flush();
    const afterDelete = lastFrame() ?? '';
    expect(afterDelete).not.toContain('Delete this block?');
    // Selection follows the moved block through a reorder — after `J` swapped
    // "first" down to the second row, "first" (not "second") is what's selected
    // and gets deleted here; "second" survives.
    expect(afterDelete).toContain('second');
    expect(afterDelete).not.toContain('first');
    unmount();
  });

  it('Esc keeps the draft — reopening E shows the unsaved edit', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const doc: PatchesPage = {
      version: 1,
      pages: [{ slug: 'index', title: 'Home', blocks: [{ type: 'Text', body: 'original' }] }],
    };
    fake.addPage('alice', 'index', doc);

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame, 'alice', 'x');
    await openOwnPage(press);
    await openBlocksEditor(press, lastFrame);

    press(KEY.enter);
    await expectFrame(lastFrame, 'Body');
    for (let index = 0; index < 'original'.length; index += 1) press(KEY.backspace);
    press('draft edit');
    await flush();
    press(KEY.ctrlS); // commit the field form (still not saved to the server)
    await expectFrame(lastFrame, 'Text — draft edit');

    press(KEY.escape); // back to PageScreen — the server document is untouched
    await waitForFrame(lastFrame, (text) => !text.includes('Edit blocks'));
    expect(lastFrame() ?? '').toContain('original');

    await openBlocksEditor(press, lastFrame);
    await expectFrame(lastFrame, 'Text — draft edit');
    unmount();
  });

  it('shows the first validation error inline on Ctrl+S rather than saving', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const doc: PatchesPage = {
      version: 1,
      pages: [{ slug: 'index', title: 'Home', blocks: [] }],
    };
    fake.addPage('alice', 'index', doc);

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame, 'alice', 'x');
    await openOwnPage(press);
    await openBlocksEditor(press, lastFrame);

    press('a');
    await expectFrame(lastFrame, 'Add a block:');
    // Gallery requires at least one media id — added with none, this is invalid.
    for (let index = 0; index < 5; index += 1) press('j');
    await expectFrame(lastFrame, 'Gallery');
    press(KEY.enter);
    await expectFrame(lastFrame, 'Gallery — 0 items');

    press(KEY.ctrlS);
    await expectFrame(lastFrame, 'mediaIds');
    // Never left the editor — no round trip happened.
    expect(lastFrame() ?? '').toContain('Edit blocks');
    unmount();
  });
});

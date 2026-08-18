import { writeFileSync } from 'node:fs';

import type { PatchesPage } from '@patches/domain';
import { describe, expect, it } from 'vitest';

import { createFakeApi, expectFrame, flush, KEY, renderApp, waitForFrame } from './harness.js';

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

/** Opens the caller's own page (`g v`) — the shortest path to `PageScreen` in a test,
 * since it needs no `SearchScreen`/profile round trip. */
async function openOwnPage(press: (input: string) => void): Promise<void> {
  press('g');
  await flush();
  press('v');
  await flush(60);
}

/** Small on purpose — `apps/tui/src/pages/render/blocks.test.tsx` already covers every
 * block type's own rendering directly; these are App-level navigation/interaction
 * tests, and Ink's `<Box height={rows}>` viewport (`App.tsx`) only has room for a
 * handful of blocks' worth of content in the fixed-size terminal `ink-testing-library`
 * renders against. */
const TWO_PAGE_DOC: PatchesPage = {
  version: 1,
  pages: [
    {
      slug: 'index',
      title: 'Home',
      blocks: [{ type: 'Hero', title: 'Welcome', subtitle: 'to my page' }],
    },
    { slug: 'about', title: 'About', blocks: [{ type: 'Text', body: 'the about sub-page' }] },
  ],
};

describe('PageScreen navigation (P45-006/007)', () => {
  it('shows the edit hint for the owner and switches sub-pages with [ and ]', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    fake.addPage('alice', 'index', TWO_PAGE_DOC);

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame, 'alice', 'x');
    await openOwnPage(press);

    const frame = await expectFrame(lastFrame, 'Welcome');
    expect(frame).toContain('to my page');
    expect(frame).toContain('e edit');
    expect(frame).not.toContain('the about sub-page');

    press(']');
    await expectFrame(lastFrame, 'the about sub-page');

    await flush();

    press('[');
    await expectFrame(lastFrame, 'Welcome');
    unmount();
  });

  it('strips theme colour and border decoration in plain mode', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    fake.addPage('alice', 'index', {
      version: 1,
      theme: { accent: '#ff00ff', border: 'round' },
      pages: [{ slug: 'index', title: '', blocks: [{ type: 'Text', body: 'hello' }] }],
    });

    const { press, lastFrame, unmount } = renderApp({ fake, env: { PATCHES_PLAIN: '1' } });
    await flush();
    await loginAs(press, lastFrame, 'alice', 'x');
    await openOwnPage(press);

    const frame = await expectFrame(lastFrame, 'hello');
    // No 256/truecolor magenta escape and no box-drawing border characters.
    expect(frame).not.toMatch(/\[38/);
    expect(frame).not.toContain('╭');
    unmount();
  });
});

describe('PageScreen guestbook (P45-004)', () => {
  it('signs the guestbook and shows the new entry', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    fake.addPage('alice', 'index', {
      version: 1,
      pages: [{ slug: 'index', title: '', blocks: [{ type: 'Guestbook', limit: 20 }] }],
    });

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame, 'alice', 'x');
    await openOwnPage(press);

    await expectFrame(lastFrame, 'No guestbook entries yet.');
    press('s');
    await flush();
    press('nice page!');
    await flush();
    press(KEY.enter);

    const frame = await expectFrame(lastFrame, 'nice page!');
    expect(frame).toContain('@alice');
    unmount();
  });
});

describe('PageScreen editor round trip (P45-006)', () => {
  it('validates, saves, and re-renders the edited document', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    fake.addPage('alice', 'index', {
      version: 1,
      pages: [{ slug: 'index', title: '', blocks: [{ type: 'Text', body: 'original' }] }],
    });

    const edited: PatchesPage = {
      version: 1,
      pages: [{ slug: 'index', title: '', blocks: [{ type: 'Text', body: 'edited by hand' }] }],
    };
    const runEditor = (path: string): void => {
      writeFileSync(path, JSON.stringify(edited));
    };

    const { press, lastFrame, unmount } = renderApp({ fake, pageEditorOptions: { runEditor } });
    await flush();
    await loginAs(press, lastFrame, 'alice', 'x');
    await openOwnPage(press);

    await expectFrame(lastFrame, 'original');
    press('e');

    const frame = await expectFrame(lastFrame, 'edited by hand');
    expect(frame).toContain('Saved.');
    unmount();
  });

  it('reports a validation error and keeps the previous document on screen', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    fake.addPage('alice', 'index', {
      version: 1,
      pages: [{ slug: 'index', title: '', blocks: [{ type: 'Text', body: 'original' }] }],
    });

    const runEditor = (path: string): void => {
      writeFileSync(path, 'not valid json');
    };

    const { press, lastFrame, unmount } = renderApp({ fake, pageEditorOptions: { runEditor } });
    await flush();
    await loginAs(press, lastFrame, 'alice', 'x');
    await openOwnPage(press);

    press('e');

    // 'original' (the untouched document) is already on screen before this edit
    // attempt, so wait on the validation error actually appearing instead.
    const frame = await waitForFrame(lastFrame, (f) => /not valid JSON/i.test(f));
    expect(frame).toContain('original');
    unmount();
  });
});

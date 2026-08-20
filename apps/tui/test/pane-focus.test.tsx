import { describe, expect, it } from 'vitest';

import { stripSgr } from './ansi.js';
import { createFakeApi, expectFrame, flush, KEY, waitForFrame } from './harness.js';
import { renderAppInWindow, type WindowAppResult } from './window.js';

/**
 * B-046 — `Tab` moves shell focus between the primary/secondary pane of a split, and
 * every action key must act on whichever pane is actually focused. The owner's report
 * (B-046): "once you're on a subpage, idk how to edit stuff on the split… how do I
 * move focused pane? And something to indicate which pane is focused" — reproduced
 * here as: focus the secondary pane (`Ctrl+G v` opens the viewer's own Page beside the
 * timeline, then `Tab`), then press `E` (structured page edit) and confirm it acts on
 * the *focused* Page pane, never on the post highlighted in the unfocused primary
 * list (which used to fire too, per the owner's exact complaint).
 */

async function loginAs(app: WindowAppResult, handle: string, password: string): Promise<void> {
  app.press('L');
  await flush();
  app.press(handle);
  await flush();
  app.press(KEY.enter);
  await flush();
  app.press(password);
  await flush();
  app.press(KEY.enter);
  await expectFrame(app.lastFrame, `· @${handle}`);
  await flush();
}

async function pressGo(app: WindowAppResult, letter: string): Promise<void> {
  app.press('g');
  await flush(60);
  app.press(letter);
  await flush(60);
}

/** `Ctrl+G v` — B-042's explicit "open beside" request: opens the viewer's own Page in
 * the secondary pane instead of replacing the current (list) screen. */
async function openOwnPageBeside(app: WindowAppResult): Promise<void> {
  app.press(''); // Ctrl+G
  await flush(60);
  app.press('v');
  await flush(60);
}

/** Matches a `SplitPane` `Pane` title row specifically (`^ > Local`), not just any
 * occurrence of the substring — plain mode's breadcrumb separator is also `>`
 * (`StatusBar`'s `plain ? ' > ' : ' › '`), so a bare `.toContain('> Page')` would
 * false-positive on "patches > Local > Page" in the header row. */
function paneIsFocused(frame: string, title: string): boolean {
  // The secondary pane's marker sits on the same physical row as the primary's,
  // immediately after the `│` divider (`SplitPane`'s `Separator`) rather than at the
  // start of a line — so the anchor is "start of line OR right after the divider",
  // not just `^`.
  const pattern = new RegExp(`(^|│)\\s*>\\s${title}\\b`, 'm');
  return pattern.test(frame);
}

function seedWorld(): ReturnType<typeof createFakeApi> {
  const fake = createFakeApi();
  const alice = fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
  fake.addPost(alice.id, 'alice older post', new Date('2026-08-19T11:00:00.000Z'));
  fake.addPost(alice.id, 'alice newest post', new Date('2026-08-19T11:30:00.000Z'));
  fake.addPage('alice', 'index', {
    version: 1,
    pages: [{ slug: 'index', title: 'Home', blocks: [{ type: 'Text', body: 'alice page body' }] }],
  });
  return fake;
}

describe('Tab moves pane focus (B-046)', () => {
  it('does nothing when the current screen is not split', async () => {
    const app = renderAppInWindow(140, 40, { fake: seedWorld() });
    await loginAs(app, 'alice', 'x');
    await pressGo(app, 'l');
    await expectFrame(app.lastFrame, 'alice newest post');
    const before = stripSgr(app.lastFrame() ?? '');
    expect(before).not.toContain('│');

    app.press(KEY.tab);
    await flush(60);
    const after = stripSgr(app.lastFrame() ?? '');
    expect(after).not.toContain('│');
    expect(after).toContain('alice newest post');
    app.unmount();
  });

  it('moves focus between panes, marked with a leading > even in plain mode', async () => {
    const app = renderAppInWindow(140, 40, { fake: seedWorld(), env: { PATCHES_PLAIN: '1' } });
    await loginAs(app, 'alice', 'x');
    await pressGo(app, 'l');
    await expectFrame(app.lastFrame, 'alice newest post');

    await openOwnPageBeside(app);
    const split = await waitForFrame(app.lastFrame, (frame) => frame.includes('alice page body'));
    expect(paneIsFocused(split, 'Local')).toBe(true);
    expect(paneIsFocused(split, 'Page')).toBe(false);

    app.press(KEY.tab);
    const focusedSecondary = await waitForFrame(app.lastFrame, (frame) =>
      paneIsFocused(frame, 'Page'),
    );
    expect(paneIsFocused(focusedSecondary, 'Local')).toBe(false);

    app.press(KEY.tab);
    const focusedPrimary = await waitForFrame(app.lastFrame, (frame) =>
      paneIsFocused(frame, 'Local'),
    );
    expect(paneIsFocused(focusedPrimary, 'Page')).toBe(false);
    app.unmount();
  });

  it('routes E to the focused secondary pane, not the highlighted post in the unfocused primary pane', async () => {
    const app = renderAppInWindow(140, 40, { fake: seedWorld() });
    await loginAs(app, 'alice', 'x');
    await pressGo(app, 'l');
    // Newest-first: alice's newest post is the highlighted row in the primary pane.
    await expectFrame(app.lastFrame, 'alice newest post');

    await openOwnPageBeside(app);
    await waitForFrame(app.lastFrame, (frame) => frame.includes('alice page body'));

    app.press(KEY.tab);
    await waitForFrame(app.lastFrame, (frame) => frame.includes('> Page'));

    app.press('E');
    const edited = await waitForFrame(app.lastFrame, (frame) => frame.includes('Edit blocks'));
    // The split survives — this is the secondary pane's own inline editor, not a
    // navigation to a full-screen `postEdit` route (which would have replaced the
    // whole split with `ComposeScreen`'s "Edit post" and the primary's highlighted
    // "alice newest post" pulled into it, per the owner's report).
    expect(edited).toContain('Local');
    expect(edited).not.toContain('Edit post');
    app.unmount();
  });
});

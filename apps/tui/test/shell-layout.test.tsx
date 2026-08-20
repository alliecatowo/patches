import { NOTIFICATION_TYPE } from '../src/api/wire/enums.js';
import stringWidth from 'string-width';
import { describe, expect, it } from 'vitest';

import { createFakeApi, expectFrame, flush, KEY, waitForFrame } from './harness.js';
import { renderAppInWindow, type WindowAppResult } from './window.js';
import { stripSgr } from './ansi.js';

/**
 * The shell's *presentation* layer: responsive tiers, split panes, the notifications
 * drawer, overlay compositing and the preferences screen (P12-020/021/022/024/127).
 *
 * The one property every case below re-checks is the frame invariant — the frame is no
 * taller than the terminal and no line is wider than it. Every new composition
 * primitive is a new way to break it, which is exactly why they are tested together.
 */

function assertFits(result: WindowAppResult, label: string): string {
  const frame = stripSgr(result.lastFrame() ?? '');
  const { columns, rows } = result.size();
  const lines = frame.split('\n');
  expect(
    lines.length,
    `${label}: frame is ${String(lines.length)} lines, terminal has ${String(rows)}`,
  ).toBeLessThanOrEqual(rows);
  for (const [index, line] of lines.entries()) {
    expect(
      stringWidth(line),
      `${label}: line ${String(index)} is ${String(stringWidth(line))} cells wide`,
    ).toBeLessThanOrEqual(columns);
  }
  return frame;
}

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

function seedTimeline(): ReturnType<typeof createFakeApi> {
  const fake = createFakeApi();
  const alice = fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
  fake.addPost(alice.id, 'a post about split panes');
  fake.addPost(alice.id, 'a second post to select');
  return fake;
}

describe('split panes are a presentation of one stack (P12-020/P12-021)', () => {
  it('opens the thread beside the timeline at wide, and collapses on resize without touching history', async () => {
    const app = renderAppInWindow(140, 40, { fake: seedTimeline() });
    await expectFrame(app.lastFrame, 'a post about split panes');
    // A frame can be written during the commit that *mounts* the list, before React
    // has flushed the passive effect that subscribes its `useInput`. Give the effect a
    // turn before pressing, or the keypress lands on nobody.
    await flush(30);
    assertFits(app, 'wide timeline');

    app.press(KEY.enter);
    // Both pane titles land on the same row — that row existing at all *is* the split.
    const split = await waitForFrame(app.lastFrame, (frame) =>
      frame.split('\n').some((line) => line.includes('Local') && line.includes('Thread')),
    );
    expect(split).toContain('Thread');
    assertFits(app, 'wide split');

    // 140 → 100 columns: same stack, one pane.
    app.resize(100, 40);
    await flush(60);
    const collapsed = await waitForFrame(
      app.lastFrame,
      (frame) =>
        !frame.split('\n').some((line) => line.includes('Local') && line.includes('Thread')),
    );
    // History is untouched: the thread is still the current screen…
    expect(collapsed).toContain('Thread');
    assertFits(app, 'collapsed to standard');

    // …and `Esc` still pops exactly one level, back to the timeline it came from.
    app.press(KEY.escape);
    await expectFrame(app.lastFrame, 'a post about split panes');
    assertFits(app, 'after Esc');
    app.unmount();
  });

  it('stays single-pane at standard width even for a detail route', async () => {
    const app = renderAppInWindow(100, 40, { fake: seedTimeline() });
    await expectFrame(app.lastFrame, 'a post about split panes');
    await flush(30);
    app.press(KEY.enter);
    await expectFrame(app.lastFrame, 'Thread');
    const frame = assertFits(app, 'standard thread');
    expect(
      frame.split('\n').some((line) => line.includes('Local') && line.includes('Thread')),
    ).toBe(false);
    app.unmount();
  });
});

describe('overlays composite over a dimmed background (P12-022)', () => {
  it('keeps the frame invariant with the command palette open at every tier', async () => {
    for (const [columns, rows] of [
      [80, 24],
      [100, 30],
      [160, 45],
    ] as const) {
      const app = renderAppInWindow(columns, rows, { fake: seedTimeline() });
      await expectFrame(app.lastFrame, 'a post about split panes');
      app.press(':');
      await expectFrame(app.lastFrame, 'Enter run');
      await flush(40);
      assertFits(app, `palette at ${String(columns)}x${String(rows)}`);
      app.unmount();
    }
  });

  it('takes the region over rather than floating when the terminal is narrow', async () => {
    const app = renderAppInWindow(70, 30, { fake: seedTimeline() });
    await expectFrame(app.lastFrame, 'Local');
    app.press(':');
    await expectFrame(app.lastFrame, 'Enter run');
    await flush(40);
    assertFits(app, 'narrow palette takeover');
    app.unmount();
  });
});

describe('the notifications drawer (P12-024)', () => {
  it('opens beside the timeline at wide and closes on Esc', async () => {
    const fake = seedTimeline();
    const app = renderAppInWindow(140, 40, { fake });
    await flush();
    await loginAs(app, 'alice', 'x');

    app.press('N');
    const opened = await expectFrame(app.lastFrame, 'Notifications');
    expect(opened).toContain('Notifications');
    assertFits(app, 'drawer open');

    app.press(KEY.escape);
    // Esc closes the drawer *before* it starts popping the navigation stack.
    await waitForFrame(app.lastFrame, (frame) => !frame.includes('> Notifications'));
    assertFits(app, 'drawer closed');
    app.unmount();
  });

  it('falls back to the full notifications screen when there are no columns for a drawer', async () => {
    const fake = seedTimeline();
    const app = renderAppInWindow(90, 30, { fake });
    await flush();
    await loginAs(app, 'alice', 'x');

    app.press('N');
    // `g n`'s screen, not a drawer: the status bar's screen title changes.
    await expectFrame(app.lastFrame, 'Notifications');
    assertFits(app, 'narrow N fallback');
    app.unmount();
  });
});

describe('the header ribbon (P12-102)', () => {
  it('moves the status line to row 0 in the full height tier, budget-neutral', async () => {
    // 40 rows clears `FULL_MIN_ROWS` (28) — the `full` density tier.
    const app = renderAppInWindow(120, 40, { fake: seedTimeline() });
    const frame = await expectFrame(app.lastFrame, 'a post about split panes');
    assertFits(app, 'full-tier ribbon');
    const lines = stripSgr(frame).split('\n');
    // The breadcrumb/connection dot land on row 0, ahead of any content.
    expect(lines[0]).toContain('patches');
    expect(lines[0]).toContain('●');
    app.unmount();
  });

  it('keeps the status line at the bottom in the compact height tier', async () => {
    // 24 rows is under `FULL_MIN_ROWS` — the `compact` density tier.
    const app = renderAppInWindow(120, 24, { fake: seedTimeline() });
    const frame = await expectFrame(app.lastFrame, 'a post about split panes');
    assertFits(app, 'compact-tier status line');
    const lines = stripSgr(frame).split('\n');
    expect(lines[0]).not.toContain('●');
    expect(lines.at(-2) ?? lines.at(-1)).toContain('●');
    app.unmount();
  });
});

describe('the direct-message drawer (P12-122)', () => {
  it('opens beside the timeline on Ctrl+D and closes on Esc, keeping the disclosure', async () => {
    const fake = seedTimeline();
    const app = renderAppInWindow(140, 40, { fake });
    await flush();
    await loginAs(app, 'alice', 'x');

    app.press('');
    const opened = await expectFrame(app.lastFrame, 'Messages');
    expect(opened).toContain('Not end-to-end encrypted');
    assertFits(app, 'dm drawer open');

    app.press(KEY.escape);
    await waitForFrame(app.lastFrame, (frame) => !frame.includes('> Messages'));
    assertFits(app, 'dm drawer closed');
    app.unmount();
  });

  it('falls back to the full messages screen when there are no columns for a drawer', async () => {
    const fake = seedTimeline();
    const app = renderAppInWindow(90, 30, { fake });
    await flush();
    await loginAs(app, 'alice', 'x');

    app.press('');
    // `g d`'s screen, not a drawer: the ribbon/status breadcrumb changes.
    const frame = await expectFrame(app.lastFrame, 'Not end-to-end encrypted');
    expect(frame).toContain('Messages');
    assertFits(app, 'narrow Ctrl+D fallback');
    app.unmount();
  });
});

describe('linear/screen-reader mode (P12-118)', () => {
  it('stays single-column even at a width that would otherwise split', async () => {
    const app = renderAppInWindow(140, 40, {
      fake: seedTimeline(),
      env: { PATCHES_LINEAR: '1' },
    });
    await expectFrame(app.lastFrame, 'a post about split panes');
    await flush(30);
    app.press(KEY.enter);
    const frame = await expectFrame(app.lastFrame, 'Thread');
    assertFits(app, 'linear mode thread');
    expect(
      frame.split('\n').some((line) => line.includes('Local') && line.includes('Thread')),
    ).toBe(false);
    app.unmount();
  });

  it('numbers notification rows', async () => {
    const fake = createFakeApi();
    const alice = fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const bob = fake.addUser({ handle: 'bob', password: 'x', displayName: '', bio: '' });
    fake.addNotification(alice.id, NOTIFICATION_TYPE.FOLLOW, { actorId: bob.id });
    const app = renderAppInWindow(120, 40, {
      fake,
      env: { PATCHES_LINEAR: '1' },
    });
    await flush();
    await loginAs(app, 'alice', 'x');
    app.press('g');
    await flush(60);
    app.press('n');
    const frame = await expectFrame(app.lastFrame, 'Notifications');
    assertFits(app, 'linear mode indexed rows');
    expect(frame).toContain('[1]');
    app.unmount();
  });
});

describe('preferences and the theme picker (P12-127)', () => {
  it(', opens preferences, l previews the next theme live, Esc restores the old one', async () => {
    const app = renderAppInWindow(120, 40, { fake: seedTimeline() });
    await expectFrame(app.lastFrame, 'Local');

    app.press(',');
    const opened = await expectFrame(app.lastFrame, 'Preferences');
    expect(opened).toContain('Theme: patches');
    expect(opened).toContain('Theme preview');
    assertFits(app, 'preferences');

    app.press('l');
    await expectFrame(app.lastFrame, 'Theme: paper');
    assertFits(app, 'preferences after preview');

    app.press(KEY.escape);
    await expectFrame(app.lastFrame, 'Local');

    // Reopening shows the theme restored by `Esc`, not the previewed one.
    app.press(',');
    await expectFrame(app.lastFrame, 'Theme: patches');
    app.unmount();
  });

  it('honours PATCHES_THEME as the session default', async () => {
    const app = renderAppInWindow(120, 40, {
      fake: seedTimeline(),
      env: { PATCHES_THEME: 'mono' },
    });
    await expectFrame(app.lastFrame, 'Local');
    app.press(',');
    const frame = await expectFrame(app.lastFrame, 'Preferences');
    expect(frame).toContain('Theme: mono');
    expect(frame).toContain('theme source: env');
    app.unmount();
  });
});

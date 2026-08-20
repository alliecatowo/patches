import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NOTIFICATION_TYPE } from '../src/api/wire/enums.js';
import stringWidth from 'string-width';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { stripSgr } from './ansi.js';
import { createFakeApi, type FakeApiHandle } from './fake-api.js';
import { expectFrame as harnessExpectFrame, flush, KEY } from './harness.js';
import { renderAppInWindow, type WindowAppResult } from './window.js';

/**
 * P12-123 — committed golden frames at the two size tiers the responsive layout
 * (`app/responsive-layout.ts`) treats differently (`standard` 100×30, `wide` 140×40),
 * for a representative screen from each of the areas P12 touched: the home timeline,
 * a thread (wide enough to trigger `SplitPane`'s two-column layout), compose, the
 * notifications screen, and a Patches Page. `UPDATE_GOLDEN=1 pnpm --filter @patches/tui
 * test -- golden` regenerates the committed `.txt` fixtures under `test/golden/` after
 * a deliberate visual change; every other run is a byte-for-byte drift check against a
 * `FakeApiHandle` (B-015) so a CI failure here means "this PR changed what a screen
 * looks like," not "a network call timed out."
 *
 * Only `Date` is faked (`vi.useFakeTimers({ toFake: ['Date'] })` + `setSystemTime`) —
 * `formatRelativeTime`'s "2 minutes ago" text is the one genuinely time-dependent
 * string on these screens, and pinning just `Date` makes it deterministic without
 * touching `setTimeout`/`setInterval`, which Ink's own render scheduling depends on
 * (faking those too produced frames that never painted at all: `Date`-and-timers fake
 * timers block Ink's internal write scheduling even with `shouldAdvanceTime`, and
 * `shouldAdvanceTime` alone reintroduces real-wall-clock drift that flipped a
 * `createdAt` sitting exactly on a minute boundary between two adjacent runs). `flush`
 * and `harness.tsx`'s own `expectFrame` are the same real-timer helpers
 * `shell-layout.test.tsx` already uses against `renderAppInWindow`.
 */

const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), 'golden');
const UPDATE = process.env.UPDATE_GOLDEN === '1';
const FROZEN_NOW = new Date('2026-08-19T12:00:00.000Z');

const SIZES = [
  { label: '100x30', columns: 100, rows: 30 },
  { label: '140x40', columns: 140, rows: 40 },
] as const;

async function expectFrame(app: WindowAppResult, text: string): Promise<string> {
  return harnessExpectFrame(app.lastFrame, text);
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
  await expectFrame(app, `· @${handle}`);
  await flush();
}

async function pressGo(app: WindowAppResult, letter: string): Promise<void> {
  app.press('g');
  await flush(60);
  app.press(letter);
  await flush(60);
}

/** Same seed for every scenario/size combination — the point of a golden frame is
 * that the *world* is fixed and only the terminal geometry changes. */
function seedWorld(): FakeApiHandle {
  const fake = createFakeApi();
  const alice = fake.addUser({ handle: 'alice', password: 'x', displayName: 'Alice', bio: '' });
  const bob = fake.addUser({ handle: 'bob', password: 'x', displayName: 'Bob', bio: '' });
  const root = fake.addPost(
    alice.id,
    'Golden frame fixture post from alice.',
    new Date(FROZEN_NOW.getTime() - 5 * 60 * 1000),
  );
  fake.addPost(
    bob.id,
    'A reply from bob, seeded for the thread golden frame.',
    new Date(FROZEN_NOW.getTime() - 2 * 60 * 1000),
    root.id,
  );
  fake.addPage('alice', 'index', {
    version: 1,
    pages: [
      {
        slug: 'index',
        title: 'Home',
        blocks: [
          { type: 'Hero', title: 'Alice', subtitle: 'golden fixture page' },
          { type: 'Text', body: 'A short page body for the golden frame.' },
        ],
      },
    ],
  });
  fake.addNotification(alice.id, NOTIFICATION_TYPE.FOLLOW, {
    actorId: bob.id,
    createdAt: new Date(FROZEN_NOW.getTime() - 60 * 1000),
  });
  return fake;
}

interface Scenario {
  name: string;
  reach: (app: WindowAppResult) => Promise<void>;
}

const SCENARIOS: readonly Scenario[] = [
  {
    name: 'home',
    reach: async (app) => {
      await loginAs(app, 'alice', 'x');
      await pressGo(app, 'l');
      await expectFrame(app, 'Golden frame fixture post');
    },
  },
  {
    name: 'thread-split',
    reach: async (app) => {
      await loginAs(app, 'alice', 'x');
      await pressGo(app, 'l');
      await expectFrame(app, 'Golden frame fixture post');
      // Newest first: bob's reply is row 0, alice's root post is row 1 — select the
      // root so its thread view shows the root *and* the reply beneath it.
      app.press('j');
      await flush();
      app.press(KEY.enter);
      await expectFrame(app, 'A reply from bob');
    },
  },
  {
    name: 'compose',
    reach: async (app) => {
      await loginAs(app, 'alice', 'x');
      app.press('c');
      await expectFrame(app, 'New Post');
      app.press('Golden frame compose draft.');
      await flush();
    },
  },
  {
    name: 'notifications-drawer',
    reach: async (app) => {
      await loginAs(app, 'alice', 'x');
      await pressGo(app, 'n');
      await expectFrame(app, 'Notifications');
    },
  },
  {
    name: 'page',
    reach: async (app) => {
      await loginAs(app, 'alice', 'x');
      await pressGo(app, 'v');
      await expectFrame(app, 'golden fixture page');
    },
  },
];

describe('Golden frames (P12-123)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  for (const size of SIZES) {
    for (const scenario of SCENARIOS) {
      it(`${scenario.name} @ ${size.label} matches the committed golden frame`, async () => {
        const fake = seedWorld();
        const app = renderAppInWindow(size.columns, size.rows, { fake });
        try {
          await scenario.reach(app);
          const frame = stripSgr(app.lastFrame() ?? '');
          const lines = frame.split('\n');

          expect(
            lines.length,
            `${scenario.name} @ ${size.label}: frame is ${String(lines.length)} lines tall, window has ${String(size.rows)}`,
          ).toBeLessThanOrEqual(size.rows);
          for (const [index, line] of lines.entries()) {
            expect(
              stringWidth(line),
              `${scenario.name} @ ${size.label}: line ${String(index)} is ${String(stringWidth(line))} cells wide, window has ${String(size.columns)}`,
            ).toBeLessThanOrEqual(size.columns);
          }

          const goldenPath = join(GOLDEN_DIR, `${scenario.name}.${size.label}.txt`);
          if (UPDATE) {
            mkdirSync(GOLDEN_DIR, { recursive: true });
            writeFileSync(goldenPath, `${frame}\n`);
            return;
          }
          if (!existsSync(goldenPath)) {
            throw new Error(
              `golden: missing fixture ${goldenPath} — run 'UPDATE_GOLDEN=1 pnpm --filter @patches/tui test -- golden' to create it.`,
            );
          }
          const expected = readFileSync(goldenPath, 'utf8').replace(/\n$/, '');
          expect(frame).toBe(expected);
        } finally {
          app.unmount();
        }
      });
    }
  }
});

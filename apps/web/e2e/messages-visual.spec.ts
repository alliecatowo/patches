import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test, type Browser, type Page } from '@playwright/test';

import { assertManagedWebBase } from './safety.js';

/**
 * #336 acceptance evidence: the messaging surface captured at 1280 and 390, in light and
 * dark, for every state the design review named — the empty inbox, a populated conversation
 * list, an open thread with messages in both directions, and the needs-authority panel.
 *
 * Runs against the lab harness like every other spec here (`mise run lab`, then
 * `pnpm --filter @patches/web test:e2e -- messages-visual`). It is a capture run, not an
 * assertion suite: it waits on real UI landmarks so a broken surface fails loudly rather than
 * producing a screenshot of a blank page, but its output is the PNGs.
 */

const SHOT_DIR = fileURLToPath(new URL('../../../.codex/messages-visual/', import.meta.url));

const VIEWPORTS = [
  { name: '1280', width: 1280, height: 900 },
  { name: '390', width: 390, height: 844 },
] as const;

const THEMES = ['light', 'dark'] as const;

const THEME_STORAGE_KEY = 'patches.web.theme.v1';

/**
 * Every wait here crosses a lazily-loaded route chunk, a real gRPC round trip and — for the
 * inbox — a poll interval, on a machine that may be running several agents' suites at once.
 * The stock 5s expect timeout turns that contention into a false negative, so this capture
 * run waits properly rather than reporting a loading spinner as a broken surface.
 */
const uiExpect = expect.configure({ timeout: 60_000 });

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

interface LabAccount {
  readonly page: Page;
  readonly handle: string;
  readonly password: string;
  readonly close: () => Promise<void>;
}

async function register(browser: Browser, label: string): Promise<LabAccount> {
  const suffix = uniqueSuffix();
  const handle = `vis_${label}_${suffix}`.slice(0, 30);
  const password = `Patches-visual-${suffix}-password`;
  const context = await browser.newContext();
  const page = await context.newPage();

  // A cold context asks the dev server to transform the whole app graph at once. Under a
  // capture run's several browser contexts that occasionally lands a genuinely blank
  // document, so the form is waited for (and one reload spent on it) rather than handed
  // straight to `fill`, whose default action timeout is unbounded and would otherwise eat
  // the entire test budget on one stalled navigation.
  await page.goto('/register', { waitUntil: 'domcontentloaded' });
  const inviteField = page.getByLabel('Invite code');
  if (!(await inviteField.isVisible().catch(() => false))) {
    await page.reload({ waitUntil: 'domcontentloaded' });
  }
  await uiExpect(inviteField).toBeVisible();
  await inviteField.fill('local-lab-no-invite');
  await page.getByLabel('Handle').fill(handle);
  await page.getByLabel('Display name').fill(`Visual ${label.toUpperCase()} ${suffix.slice(0, 4)}`);
  await page.getByLabel('Email').fill(`${handle}@patches.invalid`);
  await page.getByLabel('Password').fill(password);
  await page.getByLabel('I have read the privacy notice').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await uiExpect(page).toHaveURL(/\/$/);

  return { page, handle, password, close: () => context.close() };
}

/** The first device on a fresh account always bootstraps straight to `enrolled`. */
async function enroll(account: LabAccount): Promise<void> {
  await account.page.goto('/messages');
  await account.page
    .getByRole('button', { name: 'Enroll this browser as a messaging device' })
    .click();
  await uiExpect(account.page.getByRole('button', { name: 'New direct message' })).toBeVisible({
    timeout: 30_000,
  });
}

/** Capture runs leave a page at 390px; every setup step drives the desktop layout. */
async function toDesktopViewport(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 900 });
}

/** §183.2: a conversation may only be opened between mutual follows. */
async function followEachOther(a: LabAccount, b: LabAccount): Promise<void> {
  for (const [viewer, target] of [
    [a, b],
    [b, a],
  ] as const) {
    await toDesktopViewport(viewer.page);
    await viewer.page.goto(`/@${target.handle}`);
    const follow = viewer.page.getByRole('button', { name: 'Follow', exact: true });
    await uiExpect(follow).toBeVisible();
    await follow.click();
    await uiExpect(
      viewer.page.getByRole('button', { name: 'Following', exact: true }),
    ).toBeVisible();
  }
}

async function startConversation(from: LabAccount, to: LabAccount, body: string): Promise<void> {
  await toDesktopViewport(from.page);
  await from.page.goto(`/@${to.handle}`);
  await from.page.getByRole('button', { name: `Send message to @${to.handle}` }).click();
  await uiExpect(from.page.getByRole('heading', { name: `Message @${to.handle}` })).toBeVisible();
  await from.page.getByRole('textbox', { name: 'Message body' }).fill(body);
  await from.page.getByRole('button', { name: 'Send', exact: true }).click();
  await uiExpect(from.page).toHaveURL(/\/messages\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  await uiExpect(from.page.getByText(body)).toBeVisible();
}

/**
 * Themes are swapped on the live document rather than through a stored-preference reload.
 * `lib/theme.ts` reads the preference once at module evaluation and writes it straight to
 * `documentElement[data-theme]`, which is the only thing the token sheets key off, so this
 * produces the same pixels — and it does not remount the tree. That matters: a decrypted
 * thread lives only in the page's memory (the mailbox is drained and acknowledged as it is
 * read), so a reload between shots would leave every thread capture after the first empty.
 */
async function applyTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.evaluate(
    ([key, value]) => {
      window.localStorage.setItem(key ?? '', value ?? '');
      document.documentElement.setAttribute('data-theme', value ?? '');
    },
    [THEME_STORAGE_KEY, theme] as const,
  );
}

/**
 * Navigates to a surface once, then captures it in every viewport x theme combination.
 * `prepare` waits for the landmark that proves the surface actually rendered, so a broken
 * route fails the run instead of yielding a screenshot of a blank page.
 */
async function captureMatrix(
  page: Page,
  name: string,
  prepare: (page: Page) => Promise<void>,
): Promise<string[]> {
  // Always arrive at the surface from the desktop layout: a previous matrix leaves the page
  // at 390, where some affordances a `prepare` step clicks are the CSS-hidden pane.
  await toDesktopViewport(page);
  try {
    await prepare(page);
  } catch {
    // One retry on a fresh document. A capture run drives a cold dev server hard enough that
    // a route chunk occasionally never arrives; re-raising on the second attempt still fails
    // the run rather than screenshotting nothing.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await prepare(page);
  }

  const written: string[] = [];
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const theme of THEMES) {
      await applyTheme(page, theme);
      // Let the entry animations settle so a capture is never a half-faded frame.
      await page.waitForTimeout(600);
      const path = `${SHOT_DIR}${name}-${viewport.name}-${theme}.png`;
      await page.screenshot({ path, fullPage: false });
      written.push(path);
    }
  }
  return written;
}

test('messaging surface visual capture (#336)', async ({
  browser,
  baseURL,
}: {
  browser: Browser;
  baseURL: string | undefined;
}) => {
  assertManagedWebBase(baseURL);
  test.setTimeout(1_200_000);
  mkdirSync(SHOT_DIR, { recursive: true });

  const alice = await register(browser, 'a');
  await enroll(alice);

  // --- 1. The empty inbox, before anything exists to list. ---
  await captureMatrix(alice.page, 'empty', async (page) => {
    await page.goto('/messages', { waitUntil: 'domcontentloaded' });
    await uiExpect(page.getByText('No conversations yet — start one.')).toBeVisible({
      timeout: 60_000,
    });
  });

  // --- 2. Three conversations, one of them with traffic in both directions. ---
  // Each filler peer is closed the moment its conversation exists. Holding several live
  // contexts open at once — every one of them polling its own inbox against the dev server —
  // was enough to leave a later `newContext()` staring at a blank document.
  const fillers: string[] = [];
  for (const [label, opener] of [
    ['c', 'the design pass landed, want to take a look?'],
    ['d', 'moving the release notes to Thursday'],
  ] as const) {
    const peer = await register(browser, label);
    await enroll(peer);
    await followEachOther(alice, peer);
    await startConversation(alice, peer, opener);
    fillers.push(peer.handle);
    await peer.close();
  }
  const lastFiller = fillers[fillers.length - 1];
  if (lastFiller === undefined) throw new Error('expected a filler conversation');

  // Bob stays open past his conversation: he is the one who replies, and a fresh context
  // would have no device keys for this account, so it could not decrypt the thread.
  const bob = await register(browser, 'b');
  await enroll(bob);
  await followEachOther(alice, bob);
  await startConversation(alice, bob, 'hey — testing the new chat shell over here');

  // Bob replies so the thread has messages in both directions.
  await toDesktopViewport(bob.page);
  await bob.page.goto('/messages');
  const bobRow = bob.page.getByRole('link', { name: new RegExp(`@${alice.handle}`) });
  await uiExpect(bobRow).toBeVisible({ timeout: 60_000 });
  await bobRow.click();
  await uiExpect(bob.page.getByText('hey — testing the new chat shell over here')).toBeVisible({
    timeout: 60_000,
  });
  await bob.page
    .getByRole('textbox', { name: 'Message body' })
    .fill('yes — the bubbles group properly now');
  await bob.page.getByRole('button', { name: 'Send', exact: true }).click();
  await uiExpect(bob.page.getByText('yes — the bubbles group properly now')).toBeVisible();
  await bob.page
    .getByRole('textbox', { name: 'Message body' })
    .fill('the unread dot reads much better than the pill did');
  await bob.page.getByRole('button', { name: 'Send', exact: true }).click();

  await bob.close();

  await captureMatrix(alice.page, 'list', async (page) => {
    await page.goto('/messages', { waitUntil: 'domcontentloaded' });
    await uiExpect(page.getByRole('link', { name: new RegExp(`@${bob.handle}`) })).toBeVisible({
      timeout: 60_000,
    });
    await uiExpect(page.getByRole('link', { name: new RegExp(`@${lastFiller}`) })).toBeVisible({
      timeout: 60_000,
    });
  });

  // --- 3. An open thread with messages in both directions. ---
  await captureMatrix(alice.page, 'thread', async (page) => {
    await page.goto('/messages', { waitUntil: 'domcontentloaded' });
    await page.getByRole('link', { name: new RegExp(`@${bob.handle}`) }).click({ timeout: 60_000 });
    await uiExpect(page).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);
    await uiExpect(page.getByText('yes — the bubbles group properly now')).toBeVisible({
      timeout: 60_000,
    });
  });

  // --- 4. The needs-authority panel: a second browser on an account that already has a
  //        published messaging identity, so this device cannot enroll on its own. ---
  const secondContext = await browser.newContext();
  const secondDevice = await secondContext.newPage();
  await toDesktopViewport(secondDevice);
  await secondDevice.goto('/login');
  await secondDevice.getByLabel('Email or handle').fill(alice.handle);
  await secondDevice.getByLabel('Password').fill(alice.password);
  await secondDevice.getByRole('button', { name: 'Sign in', exact: true }).click();
  await uiExpect(secondDevice).toHaveURL(/\/$/);

  await captureMatrix(secondDevice, 'needs-authority', async (page) => {
    await page.goto('/messages', { waitUntil: 'domcontentloaded' });
    // Wait for the control rather than probing it: `isVisible()` is a point-in-time read, and
    // on a page that has only just navigated it answers `false` before the route has rendered
    // — which silently skipped the click and then spent the whole wait on a state that could
    // never arrive.
    const enrollButton = page.getByRole('button', {
      name: 'Enroll this browser as a messaging device',
    });
    await uiExpect(enrollButton).toBeVisible();
    await enrollButton.click();
    await uiExpect(page.getByRole('button', { name: 'Link this device' })).toBeVisible({
      timeout: 60_000,
    });
  });

  await secondContext.close();
  await alice.close();
});

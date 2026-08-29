import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

import { assertManagedWebBase } from './safety.js';

/**
 * Fixes #305 — regenerates the web PWA screenshots embedded in README.md. Run via
 * `mise run screenshots` (kills stray :4173/:8088/:50058, starts `mise run lab`, then this
 * spec) rather than directly: the managed-Vite/harness safety checks in `playwright.config.ts`
 * and `safety.ts` require the lab harness to already own the server/worker.
 *
 * Desktop (1280x800) and mobile (390x844, iPhone 12 viewport) captures of home, a thread,
 * a profile, messages, and settings — one registered account, one post, no destructive
 * actions beyond what `register-compose.spec.ts` already does against the same disposable
 * lab database.
 */

const MEDIA_DIR = fileURLToPath(new URL('../../../docs/media/web/', import.meta.url));

const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${MEDIA_DIR}${name}.png`, fullPage: false });
}

interface Registered {
  readonly handle: string;
  readonly postUrl: string;
}

async function registerAndPost(page: Page): Promise<Registered> {
  const suffix = uniqueSuffix();
  const handle = `readme_${suffix}`;
  const email = `${handle}@patches.invalid`;
  const password = `Patches-readme-${suffix}-password`;

  await page.goto('/register');
  await page.getByLabel('Invite code').fill('local-lab-no-invite');
  await page.getByLabel('Handle').fill(handle);
  await page.getByLabel('Display name').fill(`Readme ${suffix}`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByLabel('I have read the privacy notice').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/compose');
  await page
    .getByPlaceholder("What's on your mind?")
    .fill(
      'Patches: terminal-native, chronological social media. No ranking algorithm, no ads, no infinite scroll tricks.',
    );
  await page.getByRole('button', { name: 'Post' }).click();
  await expect(page).toHaveURL(/\/p\//);

  return { handle, postUrl: page.url() };
}

async function captureSurfaces(
  page: Page,
  prefix: string,
  target: Registered,
  isMobile: boolean,
): Promise<void> {
  await page.goto('/');
  if (isMobile) {
    // The desktop sidebar (with its "Compose" link) is CSS-hidden below 720px; the mobile
    // header bar is the equivalent always-present, viewport-visible landmark instead.
    await expect(page.locator('header').getByText('patches', { exact: true })).toBeVisible();
  } else {
    await expect(page.getByRole('link', { name: 'Compose' })).toBeVisible();
  }
  // Wait past the feed's loading skeleton so the capture shows the just-published post, not
  // placeholder bars.
  await expect(page.getByText('terminal-native, chronological social media')).toBeVisible();
  await capture(page, `${prefix}-home`);

  await page.goto(target.postUrl);
  await expect(page.getByText('terminal-native, chronological social media')).toBeVisible();
  await capture(page, `${prefix}-thread`);

  await page.goto(`/@${target.handle}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await capture(page, `${prefix}-profile`);

  await page.goto('/messages');
  await expect(page.getByRole('heading', { name: 'Messages' })).toBeVisible();
  await capture(page, `${prefix}-messages`);

  await page.goto('/settings/profile');
  await expect(page.getByRole('navigation', { name: 'Settings' })).toBeVisible();
  await capture(page, `${prefix}-settings`);
}

test.beforeAll(() => {
  mkdirSync(MEDIA_DIR, { recursive: true });
});

test('desktop viewport captures for README', async ({ page, baseURL }) => {
  test.setTimeout(90_000);
  assertManagedWebBase(baseURL);
  await page.setViewportSize(DESKTOP_VIEWPORT);
  const target = await registerAndPost(page);
  await captureSurfaces(page, 'desktop', target, false);
});

test('mobile viewport captures for README', async ({ page, baseURL }) => {
  test.setTimeout(90_000);
  assertManagedWebBase(baseURL);
  await page.setViewportSize(MOBILE_VIEWPORT);
  const target = await registerAndPost(page);
  await captureSurfaces(page, 'mobile', target, true);
});

import { expect, test, type Page, type TestInfo } from '@playwright/test';

import { assertManagedWebBase } from './safety.js';

interface BadgeCall {
  readonly operation: 'set' | 'clear';
  readonly count?: number | undefined;
}

interface Account {
  readonly handle: string;
  readonly email: string;
  readonly password: string;
}

function uniqueAccount(label: string): Account {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const handle = `badge_${label}_${suffix}`;
  return {
    handle,
    email: `${handle}@patches.invalid`,
    password: `Patches-badge-${suffix}-password`,
  };
}

async function installBadgeBoundaryStub(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const calls: BadgeCall[] = [];
    Object.defineProperties(navigator, {
      setAppBadge: {
        configurable: true,
        value: (count?: number): Promise<void> => {
          calls.push({ operation: 'set', count });
          return Promise.resolve();
        },
      },
      clearAppBadge: {
        configurable: true,
        value: (): Promise<void> => {
          calls.push({ operation: 'clear' });
          return Promise.resolve();
        },
      },
    });
    Object.assign(window, { __PATCHES_BADGE_CALLS__: calls });
  });
}

async function badgeCalls(page: Page): Promise<readonly BadgeCall[]> {
  return page.evaluate(() => {
    const testWindow = window as Window & { __PATCHES_BADGE_CALLS__?: readonly BadgeCall[] };
    return testWindow.__PATCHES_BADGE_CALLS__ ?? [];
  });
}

async function resetBadgeCalls(page: Page): Promise<void> {
  await page.evaluate(() => {
    const testWindow = window as Window & { __PATCHES_BADGE_CALLS__?: BadgeCall[] };
    testWindow.__PATCHES_BADGE_CALLS__?.splice(0);
  });
}

async function register(page: Page, account: Account): Promise<void> {
  await page.goto('/register');
  await page.getByLabel('Invite code').fill('local-lab-no-invite');
  await page.getByLabel('Handle').fill(account.handle);
  await page.getByLabel('Display name').fill(`Badge ${account.handle}`);
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByLabel('I have read the privacy notice').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
}

async function signIn(page: Page, account: Account): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email or handle').fill(account.handle);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
}

test('real unread state drives app badge set and clear through the managed UI', async ({
  page,
  baseURL,
}, testInfo: TestInfo) => {
  test.setTimeout(90_000);
  assertManagedWebBase(baseURL);
  await installBadgeBoundaryStub(page);
  const target = uniqueAccount('target');
  const follower = uniqueAccount('follower');

  await register(page, target);
  await signOut(page);
  await register(page, follower);

  await page.goto(`/@${target.handle}`);
  await page.getByRole('button', { name: 'Follow', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Following', exact: true })).toBeVisible();
  await signOut(page);

  await resetBadgeCalls(page);
  await signIn(page, target);
  await expect(page.getByRole('link', { name: 'Notifications, 1 unread' })).toBeVisible();
  await expect.poll(() => badgeCalls(page)).toContainEqual({ operation: 'set', count: 1 });

  await page.goto('/notifications');
  await expect(page.getByText(`@${follower.handle} followed you`)).toBeVisible();
  await resetBadgeCalls(page);
  await page.getByRole('button', { name: 'Mark all read' }).click();
  await expect(page.getByRole('link', { name: 'Notifications', exact: true })).toBeVisible();
  await expect.poll(() => badgeCalls(page)).toContainEqual({ operation: 'clear' });

  await resetBadgeCalls(page);
  await signOut(page);
  await expect.poll(() => badgeCalls(page)).toContainEqual({ operation: 'clear' });

  await testInfo.attach('b121-app-badge-calls.json', {
    body: JSON.stringify(await badgeCalls(page), null, 2),
    contentType: 'application/json',
  });
});

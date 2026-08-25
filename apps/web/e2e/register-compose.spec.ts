import { expect, test, type Page, type TestInfo } from '@playwright/test';

import { assertManagedWebBase } from './safety.js';

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function collectUnexpectedPageFailures(page: Page): () => readonly string[] {
  const failures: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`console error: ${message.text()}`);
  });
  page.on('pageerror', (error) => failures.push(`page error: ${error.message}`));
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? 'unknown failure';
    if (failure !== 'net::ERR_ABORTED')
      failures.push(`request failed: ${request.url()} (${failure})`);
  });
  return () => failures;
}

async function saveJourneyScreenshot(page: Page, testInfo: TestInfo): Promise<void> {
  const path = testInfo.outputPath('registered-and-posted.png');
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach('registered-and-posted', { path, contentType: 'image/png' });
}

test('a fresh lab user can register, relogin, and publish a post', async ({
  page,
  baseURL,
}, testInfo) => {
  assertManagedWebBase(baseURL);
  // The Register form currently requires a non-empty field even when the lab node has
  // INVITE_ONLY=false. The local placeholder satisfies that UI constraint but is neither
  // minted nor consumed by the server; a remote preview must receive a disposable invite.
  const inviteCode = 'local-lab-no-invite';
  const suffix = uniqueSuffix();
  const handle = `e2e_${suffix}`;
  const email = `${handle}@patches.invalid`;
  const password = `Patches-e2e-${suffix}-password`;
  const postBody = `Browser smoke post ${suffix}`;
  const pageFailures = collectUnexpectedPageFailures(page);

  const health = await page.request.get('/api/healthz');
  await expect(health).toBeOK();
  expect((await health.json()) as unknown).toEqual({ status: 'ok' });

  await page.goto('/register');
  await expect(page.getByRole('heading', { name: 'Register' })).toBeVisible();
  await page.getByLabel('Invite code').fill(inviteCode);
  await page.getByLabel('Handle').fill(handle);
  await page.getByLabel('Display name').fill(`E2E ${suffix}`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByLabel('I have read the privacy notice').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/$/);

  // A fresh page proves the persisted session is usable; signing out and back in exercises the
  // actual password login UI rather than relying only on the Register response.
  await page.reload();
  await expect(page.getByRole('link', { name: 'Compose' })).toBeVisible();
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: /sign out/i }).click();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  await page.goto('/login');
  await page.getByLabel('Email or handle').fill(handle);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/compose');
  await expect(page.getByRole('heading', { name: 'New post' })).toBeVisible();
  await page.getByPlaceholder("What's on your mind?").fill(postBody);
  await page.getByRole('button', { name: 'Post' }).click();
  await expect(page).toHaveURL(/\/p\//);
  await expect(page.getByText(postBody)).toBeVisible();
  await saveJourneyScreenshot(page, testInfo);

  expect(pageFailures()).toEqual([]);
});

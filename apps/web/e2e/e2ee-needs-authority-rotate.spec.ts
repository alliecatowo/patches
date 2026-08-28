import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from '@playwright/test';

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

async function saveJourneyScreenshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

/**
 * Owner-reported flow (issues #292/#293/#294): a second, vault-less browser context for an
 * already-enrolled account must be offered "start a new messaging identity" (rotation)
 * rather than failing with "no published messaging identity" — the account already has one,
 * this device just doesn't hold it locally.
 */
test('a second vault-less context can rotate its way into messaging', async ({
  browser,
  baseURL,
}: {
  browser: Browser;
  baseURL: string | undefined;
}, testInfo) => {
  assertManagedWebBase(baseURL);

  const inviteCode = 'local-lab-no-invite';
  const suffix = uniqueSuffix();
  const handle = `e2e_${suffix}`;
  const email = `${handle}@patches.invalid`;
  const password = `Patches-e2e-${suffix}-password`;

  const contextA: BrowserContext = await browser.newContext();
  const pageA = await contextA.newPage();

  // --- Context A: register, then enroll this device's messaging identity. ---
  await pageA.goto('/register');
  await expect(pageA.getByRole('heading', { name: 'Register' })).toBeVisible();
  await pageA.getByLabel('Invite code').fill(inviteCode);
  await pageA.getByLabel('Handle').fill(handle);
  await pageA.getByLabel('Display name').fill(`E2E ${suffix}`);
  await pageA.getByLabel('Email').fill(email);
  await pageA.getByLabel('Password').fill(password);
  await pageA.getByLabel('I have read the privacy notice').check();
  await pageA.getByRole('button', { name: 'Create account' }).click();
  await expect(pageA).toHaveURL(/\/$/);

  await pageA.goto('/messages');
  await expect(pageA.getByRole('heading', { name: 'Messages' })).toBeVisible();
  await pageA.getByRole('button', { name: 'Enroll this browser as a messaging device' }).click();
  // The first device on the account bootstraps its own root directly to `enrolled` —
  // never `needs-authority` (there is nothing else to be an authority yet).
  await expect(
    pageA.getByRole('note').filter({ hasText: 'This browser holds its own device keys.' }),
  ).toBeVisible();
  await expect(
    pageA.getByRole('group', { name: 'This device cannot enroll on its own' }),
  ).toHaveCount(0);
  await saveJourneyScreenshot(pageA, testInfo, 'a-enrolled');

  // --- Context B: same account, empty IndexedDB/localStorage vault. ---
  const contextB: BrowserContext = await browser.newContext();
  const pageB = await contextB.newPage();
  const failuresB = collectUnexpectedPageFailures(pageB);

  await pageB.goto('/login');
  await pageB.getByLabel('Email or handle').fill(handle);
  await pageB.getByLabel('Password').fill(password);
  await pageB.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(pageB).toHaveURL(/\/$/);

  await pageB.goto('/messages');
  await expect(pageB.getByRole('heading', { name: 'Messages' })).toBeVisible();
  await pageB.getByRole('button', { name: 'Enroll this browser as a messaging device' }).click();

  const needsAuthorityCard = pageB.getByRole('group', {
    name: 'This device cannot enroll on its own',
  });
  await expect(needsAuthorityCard).toBeVisible();
  const linkButton = pageB.getByRole('button', { name: /link this device/i });
  const rotateButton = pageB.getByRole('button', { name: /start a new/i });
  const cancelButton = pageB.getByRole('button', { name: /cancel/i });
  await expect(linkButton).toBeVisible();
  await expect(rotateButton).toBeVisible();
  await expect(cancelButton).toBeVisible();
  await saveJourneyScreenshot(pageB, testInfo, 'b-needs-authority');

  // --- Rotate: mint a fresh identity from context B instead of linking. ---
  await rotateButton.click();
  const rotateDialog = pageB.getByRole('alertdialog', { name: 'Start a new messaging identity' });
  await expect(rotateDialog).toBeVisible();
  await saveJourneyScreenshot(pageB, testInfo, 'b-rotate-confirm');

  await rotateDialog.getByRole('button', { name: 'Start new identity' }).click();

  await expect(pageB.getByText(/no published messaging identity/i)).toHaveCount(0);
  await expect(rotateDialog).toHaveCount(0);
  await expect(needsAuthorityCard).toHaveCount(0);
  await expect(
    pageB.getByRole('note').filter({ hasText: 'This browser holds its own device keys.' }),
  ).toBeVisible();
  await saveJourneyScreenshot(pageB, testInfo, 'b-rotated');

  expect(failuresB()).toEqual([]);

  // --- Context A: reload after B's rotation must not crash. Attached fresh (not from
  // page load) because bootstrapping the very first device on an account legitimately
  // probes `GetIdentityRoot` before one exists, which Connect maps to an HTTP 404 the
  // browser logs on its own — expected bootstrap noise, not a page failure to police. ---
  const failuresA = collectUnexpectedPageFailures(pageA);
  await pageA.reload();
  await expect(pageA.getByRole('heading', { name: 'Messages' })).toBeVisible();
  await saveJourneyScreenshot(pageA, testInfo, 'a-after-rotate-reload');

  expect(failuresA()).toEqual([]);

  await contextB.close();
  await contextA.close();
});

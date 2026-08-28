import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';

import { assertManagedWebBase } from './safety.js';

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

interface LabAccount {
  readonly page: Page;
  readonly handle: string;
  readonly close: () => Promise<void>;
}

async function saveJourneyScreenshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

/** Registers a fresh lab account in its own browser context and enrolls it as a messaging
 * device. Every account here is brand new, so the first device on the account always
 * bootstraps straight to `enrolled` — `needs-authority` has no other device to defer to. */
async function registerAndEnroll(browser: Browser, label: string): Promise<LabAccount> {
  const suffix = uniqueSuffix();
  const handle = `dm_${label}_${suffix}`.slice(0, 30);
  const password = `Patches-e2e-${suffix}-password`;
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('/register');
  await page.getByLabel('Invite code').fill('local-lab-no-invite');
  await page.getByLabel('Handle').fill(handle);
  await page.getByLabel('Display name').fill(`DM ${label} ${suffix}`);
  await page.getByLabel('Email').fill(`${handle}@patches.invalid`);
  await page.getByLabel('Password').fill(password);
  await page.getByLabel('I have read the privacy notice').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/messages');
  await expect(page.getByRole('heading', { name: 'Messages' })).toBeVisible();
  await page.getByRole('button', { name: 'Enroll this browser as a messaging device' }).click();
  await expect(
    page.getByRole('note').filter({ hasText: 'This browser holds its own device keys.' }),
  ).toBeVisible({ timeout: 30_000 });

  return { page, handle, close: () => context.close() };
}

/** §183.2: a conversation may only be opened between mutual follows. Both directions have to
 * be established before either side can start one, so this is setup, not part of the flow
 * under test. */
async function followEachOther(a: LabAccount, b: LabAccount): Promise<void> {
  for (const [viewer, target] of [
    [a, b],
    [b, a],
  ] as const) {
    await viewer.page.goto(`/@${target.handle}`);
    const follow = viewer.page.getByRole('button', { name: 'Follow', exact: true });
    await expect(follow).toBeVisible();
    await follow.click();
    await expect(viewer.page.getByRole('button', { name: 'Following', exact: true })).toBeVisible();
  }
}

/**
 * Owner-reported P0 (issues #320/#323): with both accounts enrolled, starting a conversation
 * failed with a blind "The conversation could not be started." and the profile "Message"
 * button was a stub that never called anything. This proves the whole round trip: the profile
 * button opens the real compose flow, the first message lands, the recipient polls it up, and
 * a reply travels back.
 */
test('two enrolled accounts exchange a first message in both directions', async ({
  browser,
  baseURL,
}: {
  browser: Browser;
  baseURL: string | undefined;
}, testInfo) => {
  assertManagedWebBase(baseURL);

  const alice = await registerAndEnroll(browser, 'a');
  const bob = await registerAndEnroll(browser, 'b');
  await followEachOther(alice, bob);

  // --- Alice starts the conversation from Bob's profile (#323). ---
  await alice.page.goto(`/@${bob.handle}`);
  await alice.page.getByRole('button', { name: `Send message to @${bob.handle}` }).click();
  await expect(alice.page).toHaveURL(new RegExp(`/messages\\?to=${bob.handle}$`));
  await expect(alice.page.getByRole('heading', { name: `Message @${bob.handle}` })).toBeVisible();
  await saveJourneyScreenshot(alice.page, testInfo, 'a-compose-from-profile');

  const firstMessage = 'first message from the web client';
  await alice.page.getByRole('textbox', { name: 'Message body' }).fill(firstMessage);
  await alice.page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(alice.page).toHaveURL(/\/messages\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  // A device is not in its own fanout, so nothing will ever redeliver this message to the
  // person who wrote it — but the thread must still show it, rather than claiming it holds
  // nothing.
  await expect(alice.page.getByText(firstMessage)).toBeVisible();
  await saveJourneyScreenshot(alice.page, testInfo, 'a-sent');

  // Issue #332: the echo above used to be in-memory only, so a reload emptied the sender's
  // half of her own thread. It now comes back out of this browser's vault.
  await alice.page.reload();
  await expect(alice.page.getByText(firstMessage)).toBeVisible({ timeout: 30_000 });
  await saveJourneyScreenshot(alice.page, testInfo, 'a-sent-after-reload');

  // --- Bob polls it up and replies. ---
  await bob.page.goto('/messages');
  const conversationRow = bob.page.getByRole('link', { name: new RegExp(`@${alice.handle}`) });
  await expect(conversationRow).toBeVisible({ timeout: 60_000 });
  await conversationRow.click();
  await expect(bob.page.getByText(firstMessage)).toBeVisible({ timeout: 60_000 });
  await saveJourneyScreenshot(bob.page, testInfo, 'b-received');

  const reply = 'reply from the other browser';
  await bob.page.getByRole('textbox', { name: 'Message body' }).fill(reply);
  await bob.page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(bob.page.getByText(reply)).toBeVisible();

  // --- Alice sees the reply. ---
  await expect(alice.page.getByText(reply)).toBeVisible({ timeout: 60_000 });
  await saveJourneyScreenshot(alice.page, testInfo, 'a-received-reply');

  await bob.close();
  await alice.close();
});

/**
 * The other half of #320: the node answers every unavailable-recipient case with one uniform
 * `not_found` (spec §62), so a client that only reports "the conversation could not be
 * started" leaves the person with nothing to act on. Two accounts that are not mutual follows
 * (§183.2) must be told which fact is in the way, before they spend a message finding out.
 */
test('a recipient who is not a mutual follow is explained, not silently refused', async ({
  browser,
  baseURL,
}: {
  browser: Browser;
  baseURL: string | undefined;
}, testInfo) => {
  assertManagedWebBase(baseURL);

  const alice = await registerAndEnroll(browser, 'x');
  const stranger = await registerAndEnroll(browser, 'y');

  await alice.page.goto(`/@${stranger.handle}`);
  await alice.page.getByRole('button', { name: `Send message to @${stranger.handle}` }).click();
  await expect(
    alice.page.getByRole('heading', { name: `Message @${stranger.handle}` }),
  ).toBeVisible();

  await expect(alice.page.getByText(`@${stranger.handle} has to follow you back`)).toBeVisible({
    timeout: 15_000,
  });
  await alice.page.getByRole('textbox', { name: 'Message body' }).fill('should not be sendable');
  await expect(alice.page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
  await saveJourneyScreenshot(alice.page, testInfo, 'x-not-mutual');

  await stranger.close();
  await alice.close();
});

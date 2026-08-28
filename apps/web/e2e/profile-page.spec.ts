import { expect, test } from '@playwright/test';

import { assertManagedWebBase } from './safety.js';

/** B-216: register → open own profile → Wall tab → Edit Wall → add a Text block → Save →
 * assert the block's text is visible on the wall, then follow "View full page →" and assert
 * it's visible there too (both without a reload — invalidation must actually refresh both
 * reads), then reload the full-page route and assert it survives a hard refresh. */

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

test('editing the wall from the profile page is visible on the wall and the full page', async ({
  page,
  baseURL,
}) => {
  assertManagedWebBase(baseURL);
  const inviteCode = 'local-lab-no-invite';
  const suffix = uniqueSuffix();
  const handle = `e2ewall_${suffix}`;
  const email = `${handle}@patches.invalid`;
  const password = `Patches-e2e-${suffix}-password`;
  const wallText = `Wall block text ${suffix}`;

  await page.goto('/register');
  await page.getByLabel('Invite code').fill(inviteCode);
  await page.getByLabel('Handle').fill(handle);
  await page.getByLabel('Display name').fill(`E2E Wall ${suffix}`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByLabel('I have read the privacy notice').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto(`/@${handle}`);
  await page.getByRole('button', { name: 'Wall' }).click();
  await expect(page.getByText('No wall content yet.')).toBeVisible();

  await page.getByRole('button', { name: '+ Edit Wall' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit Profile Wall' })).toBeVisible();
  await page.getByPlaceholder('Write text or markdown for your wall...').fill(wallText);
  await page.getByRole('button', { name: '+ Add Block' }).click();
  await expect(page.getByText(wallText, { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Save Wall' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit Profile Wall' })).not.toBeVisible();

  // Visible on the profile's Wall tab without a reload.
  await expect(page.getByText(wallText)).toBeVisible();

  // Visible on the full Page route without a reload.
  await page.getByRole('link', { name: 'View full page →' }).click();
  await expect(page).toHaveURL(new RegExp(`/page/@${handle}$`));
  await expect(page.getByText(wallText)).toBeVisible();
  await expect(page.getByText("This page couldn't be displayed.")).toHaveCount(0);

  // Survives a hard reload of the full page route too.
  await page.reload();
  await expect(page.getByText(wallText)).toBeVisible();
  await expect(page.getByText("This page couldn't be displayed.")).toHaveCount(0);
});

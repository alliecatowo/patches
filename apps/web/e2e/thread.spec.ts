import { expect, test } from '@playwright/test';

import { assertManagedWebBase } from './safety.js';

/** #154: the thread flagship surface — register, post a root, reply to it, reply to
 * that reply, then confirm the deeper thread's collapsible ancestor chain (spec §24 —
 * bounded, never an unbounded walk to the true root) collapses to the immediate parent
 * by default and expands to reveal the root on request. */

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

test('reply-to-a-reply shows a collapsible ancestor chain on the deeper thread', async ({
  page,
  baseURL,
}) => {
  assertManagedWebBase(baseURL);
  const inviteCode = 'local-lab-no-invite';
  const suffix = uniqueSuffix();
  const handle = `e2ethread_${suffix}`;
  const email = `${handle}@patches.invalid`;
  const password = `Patches-e2e-${suffix}-password`;
  const rootBody = `Thread root ${suffix}`;
  const reply1Body = `First reply ${suffix}`;
  const reply2Body = `Second reply ${suffix}`;

  await page.goto('/register');
  await page.getByLabel('Invite code').fill(inviteCode);
  await page.getByLabel('Handle').fill(handle);
  await page.getByLabel('Display name').fill(`E2E Thread ${suffix}`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByLabel('I have read the privacy notice').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/$/);

  // Root post.
  await page.goto('/compose');
  await page.getByPlaceholder("What's on your mind?").fill(rootBody);
  await page.getByRole('button', { name: 'Post' }).click();
  await expect(page).toHaveURL(/\/p\//);
  await expect(page.getByText(rootBody)).toBeVisible();

  // Reply to the root, inline.
  await page.getByLabel('Write a reply').fill(reply1Body);
  await page.getByRole('button', { name: 'Reply' }).click();
  await expect(page.getByText('Reply posted')).toBeVisible();
  const repliesRegion = page.getByRole('region', { name: 'Replies' });
  await expect(repliesRegion.getByText(reply1Body)).toBeVisible();

  // Only one ancestor above a direct reply to root — the chain is never collapsed
  // when there's nothing to hide.
  const reply1Href = await repliesRegion.locator('a[href^="/p/"]').first().getAttribute('href');
  expect(reply1Href).toBeTruthy();

  // Open the reply's own thread and reply to it, building a reply-to-a-reply.
  await page.goto(reply1Href!);
  await expect(page.getByText(reply1Body)).toBeVisible();
  await expect(page.getByRole('button', { name: /Show \d+ earlier/ })).toHaveCount(0);

  await page.getByLabel('Write a reply').fill(reply2Body);
  await page.getByRole('button', { name: 'Reply' }).click();
  await expect(page.getByText('Reply posted')).toBeVisible();
  const deeperRepliesRegion = page.getByRole('region', { name: 'Replies' });
  await expect(deeperRepliesRegion.getByText(reply2Body)).toBeVisible();
  const reply2Href = await deeperRepliesRegion
    .locator('a[href^="/p/"]')
    .first()
    .getAttribute('href');
  expect(reply2Href).toBeTruthy();

  // The deeper thread: two ancestors (root, reply1) collapse to just the immediate
  // parent by default.
  await page.goto(reply2Href!);
  await expect(page.getByText(reply2Body)).toBeVisible();
  const ancestorsRegion = page.getByRole('region', { name: 'Earlier in this thread' });
  await expect(ancestorsRegion.getByText(reply1Body)).toBeVisible();
  await expect(ancestorsRegion.getByText(rootBody)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show 1 earlier post' })).toBeVisible();

  // Expanding reveals the root too.
  await page.getByRole('button', { name: 'Show 1 earlier post' }).click();
  await expect(ancestorsRegion.getByText(rootBody)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Collapse' })).toBeVisible();
});

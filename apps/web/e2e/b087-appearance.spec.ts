import { expect, test, type Page, type TestInfo } from '@playwright/test';

import { assertManagedWebBase } from './safety.js';

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

async function registerForAppearance(page: Page): Promise<void> {
  const suffix = uniqueSuffix();
  const handle = `appearance_${suffix}`;
  await page.goto('/register');
  await page.getByLabel('Invite code').fill('local-lab-no-invite');
  await page.getByLabel('Handle').fill(handle);
  await page.getByLabel('Display name').fill(`Appearance ${suffix}`);
  await page.getByLabel('Email').fill(`${handle}@patches.invalid`);
  await page.getByLabel('Password').fill(`Patches-e2e-${suffix}-password`);
  await page.getByLabel('I have read the privacy notice').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function publishPost(page: Page): Promise<string> {
  const body = `Compact density proof ${uniqueSuffix()}`;
  await page.goto('/compose');
  await page.getByPlaceholder("What's on your mind?").fill(body);
  await page.getByRole('button', { name: 'Post' }).click();
  await expect(page).toHaveURL(/\/p\//);
  return body;
}

async function assertFanGeometry(
  page: Page,
  viewport: { readonly width: number; readonly height: number },
): Promise<void> {
  const links = page.getByRole('navigation', { name: 'Quick navigation' }).getByRole('link');
  const trigger = await page.getByRole('button', { name: 'Close quick menu' }).boundingBox();
  expect(trigger).not.toBeNull();
  if (trigger === null) throw new Error('Compose trigger has no bounding box.');
  const boxes = [];
  for (let index = 0; index < 6; index += 1) {
    const box = await links.nth(index).boundingBox();
    expect(box).not.toBeNull();
    if (box === null) throw new Error(`Quick-navigation link ${index} has no bounding box.`);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    boxes.push(box);
  }

  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      const a = boxes[left];
      const b = boxes[right];
      if (a === undefined || b === undefined) throw new Error('Missing quick-navigation bounds.');
      const overlaps =
        a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
      expect(overlaps).toBe(false);
    }
  }

  const triggerCenter = { x: trigger.x + trigger.width / 2, y: trigger.y + trigger.height / 2 };
  const points = boxes.map((box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 }));
  const polar = points.map((point) => {
    const dx = point.x - triggerCenter.x;
    const dy = point.y - triggerCenter.y;
    return { radius: Math.hypot(dx, dy), angle: Math.atan2(-dy, dx) };
  });
  for (const point of polar) {
    expect(point.radius).toBeGreaterThan(190);
    expect(point.radius).toBeLessThan(210);
  }
  const angles = polar.map((point) => point.angle).sort((a, b) => a - b);
  expect((angles.at(-1) ?? 0) - (angles[0] ?? 0)).toBeGreaterThan(1.4);
  for (let index = 1; index < angles.length; index += 1) {
    expect((angles[index] ?? 0) - (angles[index - 1] ?? 0)).toBeGreaterThan(0.2);
  }

  // A diagonal/stacked regression makes this triangle nearly flat; the arc has real area.
  const first = points[0];
  const middle = points[2];
  const last = points[5];
  if (first === undefined || middle === undefined || last === undefined) {
    throw new Error('Missing radial geometry points.');
  }
  const doubledTriangleArea = Math.abs(
    first.x * (middle.y - last.y) + middle.x * (last.y - first.y) + last.x * (first.y - middle.y),
  );
  expect(doubledTriangleArea).toBeGreaterThan(5_000);

  await page.getByRole('button', { name: 'Close quick menu' }).focus();
  const labels = ['post', 'search', 'messages', 'report', 'notifications', 'home'] as const;
  for (let index = 0; index < labels.length; index += 1) {
    const link = links.nth(index);
    const label = link.getByText(labels[index] ?? '', { exact: true });
    await link.hover();
    await expect(label).toHaveCSS('opacity', '1');
    const labelBox = await label.boundingBox();
    expect(labelBox).not.toBeNull();
    if (labelBox === null) throw new Error(`Quick-navigation label ${index} has no bounds.`);
    expect(labelBox.x).toBeGreaterThanOrEqual(0);
    expect(labelBox.x + labelBox.width).toBeLessThanOrEqual(viewport.width);
    expect(labelBox.y).toBeGreaterThanOrEqual(0);
    expect(labelBox.y + labelBox.height).toBeLessThanOrEqual(viewport.height);

    for (let targetIndex = 0; targetIndex < boxes.length; targetIndex += 1) {
      const target = boxes[targetIndex];
      if (target === undefined) throw new Error(`Missing target bounds ${targetIndex}.`);
      const overlaps =
        labelBox.x < target.x + target.width &&
        labelBox.x + labelBox.width > target.x &&
        labelBox.y < target.y + target.height &&
        labelBox.y + labelBox.height > target.y;
      expect(overlaps, `${labels[index]} label overlaps target ${targetIndex}`).toBe(false);
    }
  }
  await page.mouse.move(triggerCenter.x, triggerCenter.y);
  await links.nth(0).focus();
}

test('B-087 appearance choices persist and retain an accessible six-action radial fan', async ({
  page,
  baseURL,
}, testInfo: TestInfo) => {
  assertManagedWebBase(baseURL);
  await registerForAppearance(page);
  const postBody = await publishPost(page);

  await page.goto('/settings/appearance');
  await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible();
  await page.getByRole('radio', { name: 'Radial fan' }).check();
  await page.getByRole('radio', { name: 'Compact' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-fan-style', 'radial');
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');

  await page.reload();
  await expect(page.getByRole('radio', { name: 'Radial fan' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Compact' })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-fan-style', 'radial');
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');

  // The reduced-motion state is also a deterministic visual-proof surface: no stagger can
  // leave one fixed action mid-flight in the screenshot.
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Everyone here' }).click();
  const article = page.getByRole('article').filter({ hasText: postBody });
  await expect(article).toBeVisible();
  const cardMetrics = await article.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      gap: style.columnGap,
      paddingBlock: style.paddingTop,
      paddingInline: style.paddingLeft,
    };
  });
  const avatarWidth = await article
    .locator('a[href^="/@"] > div')
    .evaluate((element) => getComputedStyle(element).width);
  expect(cardMetrics).toEqual({ gap: '8px', paddingBlock: '8px', paddingInline: '12px' });
  expect(avatarWidth).toBe('28px');

  const viewports = [
    { width: 320, height: 568 },
    { width: 360, height: 640 },
    { width: 390, height: 844 },
  ] as const;

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const openButton = page.getByRole('button', { name: 'Open quick menu' });
    await openButton.click();
    const navigation = page.getByRole('navigation', { name: 'Quick navigation' });
    const links = navigation.getByRole('link');
    await expect(navigation).toHaveAttribute('data-layout', 'radial');
    await expect(links).toHaveCount(6);
    await expect(links.nth(0)).toBeFocused();
    await expect(navigation.getByText('post', { exact: true })).toHaveCSS('opacity', '1');
    await expect(navigation.getByRole('link', { name: 'post' })).toHaveAttribute(
      'href',
      '/compose',
    );
    await expect(navigation.getByRole('link', { name: 'search' })).toHaveAttribute(
      'href',
      '/search',
    );
    await expect(navigation.getByRole('link', { name: 'messages' })).toHaveAttribute(
      'href',
      '/messages',
    );
    await expect(navigation.getByRole('link', { name: 'report' })).toHaveAttribute(
      'href',
      '/report',
    );
    await expect(navigation.getByRole('link', { name: 'notifications' })).toHaveAttribute(
      'href',
      '/notifications',
    );
    await expect(navigation.getByRole('link', { name: 'home' })).toHaveAttribute('href', '/');
    await assertFanGeometry(page, viewport);

    const screenshot = testInfo.outputPath(`b087-radial-${viewport.width}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    await testInfo.attach(`b087-radial-${viewport.width}`, {
      path: screenshot,
      contentType: 'image/png',
    });

    await page.keyboard.press('Escape');
    await expect(openButton).toBeFocused();
    await expect(navigation).not.toBeVisible();
  }
});

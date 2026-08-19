import { describe, expect, it } from 'vitest';

import {
  breadcrumbSegmentLimit,
  FULL_MIN_ROWS,
  MIN_SPLIT_PANE_COLUMNS,
  planResponsiveLayout,
  type WidthTier,
} from './responsive-layout.js';

describe('planResponsiveLayout', () => {
  it.each([
    [0, 'narrow'],
    [79, 'narrow'],
    [80, 'standard'],
    [119, 'standard'],
    [120, 'wide'],
    [159, 'wide'],
    [160, 'ultra'],
  ] satisfies ReadonlyArray<readonly [number, WidthTier]>)(
    'classifies the %i-column boundary as %s',
    (width, widthTier) => {
      const plan = planResponsiveLayout(width, 28, true);

      expect(plan.widthTier).toBe(widthTier);
      expect(plan.contentColumns).toBe(width);
      expect(plan.mode).toBe(width < 120 ? 'single' : 'split');
    },
  );

  it.each([
    [0, 'compact'],
    [27, 'compact'],
    [28, 'full'],
  ] as const)('classifies the %i-row boundary as %s', (height, heightDensity) => {
    const plan = planResponsiveLayout(120, height, true);

    expect(plan.heightDensity).toBe(heightDensity);
    expect(plan.contentRows).toBe(height);
  });

  it('clamps negative and non-finite dimensions to zero terminal cells', () => {
    expect(planResponsiveLayout(-10, -2, true)).toMatchObject({
      contentColumns: 0,
      contentRows: 0,
      leftWidth: 0,
      rightWidth: 0,
      gap: 0,
      mode: 'single',
    });
    expect(planResponsiveLayout(Number.NaN, Number.POSITIVE_INFINITY)).toMatchObject({
      contentColumns: 0,
      contentRows: 0,
    });
  });

  it('stays single-pane when detail is not requested at wide sizes', () => {
    expect(planResponsiveLayout(160, FULL_MIN_ROWS, false)).toMatchObject({
      leftWidth: 160,
      rightWidth: 0,
      gap: 0,
      mode: 'single',
    });
  });

  it.each([120, 159, 160])('allocates a deterministic useful split at %i columns', (width) => {
    const plan = planResponsiveLayout(width, FULL_MIN_ROWS, true);

    expect(plan.leftWidth + plan.gap + plan.rightWidth).toBe(width);
    expect(plan.leftWidth).toBeGreaterThanOrEqual(MIN_SPLIT_PANE_COLUMNS);
    expect(plan.rightWidth).toBeGreaterThanOrEqual(MIN_SPLIT_PANE_COLUMNS);
    expect(plan.leftWidth / width).toBeGreaterThanOrEqual(0.45);
    expect(plan.leftWidth / width).toBeLessThanOrEqual(0.55);
  });
});

describe('breadcrumbSegmentLimit', () => {
  it('grows monotonically with the width tier, narrowest first', () => {
    const tiers: readonly WidthTier[] = ['narrow', 'standard', 'wide', 'ultra'];
    const limits = tiers.map(breadcrumbSegmentLimit);

    expect(limits).toEqual([1, 2, 3, 4]);
    for (let index = 1; index < limits.length; index += 1) {
      expect(limits[index]).toBeGreaterThan(limits[index - 1] ?? 0);
    }
  });
});

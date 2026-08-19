import type { RenderablePageBlock } from '@patches/domain';
import { describe, expect, it } from 'vitest';

import { chunkIntoRows, classifyPageWidth, galleryColumnsFor, planPageGrid } from './grid.js';

const TEXT: RenderablePageBlock = { type: 'Text', body: 'hi' };
const TOP_EIGHT: RenderablePageBlock = { type: 'TopEight', actors: ['@a'] };
const LINKS: RenderablePageBlock = { type: 'Links', links: [] };
const FRIENDS: RenderablePageBlock = { type: 'Friends' };

describe('classifyPageWidth', () => {
  it('buckets at the app-wide standard/wide breakpoints', () => {
    expect(classifyPageWidth(79)).toBe('narrow');
    expect(classifyPageWidth(80)).toBe('standard');
    expect(classifyPageWidth(119)).toBe('standard');
    expect(classifyPageWidth(120)).toBe('wide');
    expect(classifyPageWidth(200)).toBe('wide');
  });
});

describe('planPageGrid (P12-109)', () => {
  it('is always a single lane, in document order, at narrow width', () => {
    const blocks = [TEXT, TOP_EIGHT, FRIENDS];
    const lanes = planPageGrid(blocks, 70);
    expect(lanes).toHaveLength(1);
    expect(lanes[0]?.entries.map((entry) => entry.block)).toEqual(blocks);
    expect(lanes[0]?.entries.map((entry) => entry.index)).toEqual([0, 1, 2]);
  });

  it('stays single-lane at standard/wide width when there is nothing sidebar-shaped', () => {
    const blocks = [TEXT, TEXT];
    expect(planPageGrid(blocks, 100)).toHaveLength(1);
    expect(planPageGrid(blocks, 140)).toHaveLength(1);
  });

  it('splits main from the sidebar at standard width', () => {
    const blocks = [TEXT, TOP_EIGHT, TEXT, LINKS];
    const lanes = planPageGrid(blocks, 100);
    expect(lanes).toHaveLength(2);
    expect(lanes[0]?.entries.map((entry) => entry.index)).toEqual([0, 2]);
    expect(lanes[1]?.entries.map((entry) => entry.index)).toEqual([1, 3]);
    const totalWidth = lanes.reduce((sum, lane) => sum + lane.width, 0);
    expect(totalWidth).toBeLessThanOrEqual(100);
  });

  it('falls back to two lanes at wide width with only one sidebar block', () => {
    const blocks = [TEXT, TOP_EIGHT];
    const lanes = planPageGrid(blocks, 140);
    expect(lanes).toHaveLength(2);
  });

  it('splits the sidebar into two lanes at wide width once there are 2+ sidebar blocks', () => {
    const blocks = [TEXT, TOP_EIGHT, FRIENDS, LINKS];
    const lanes = planPageGrid(blocks, 140);
    expect(lanes).toHaveLength(3);
    expect(lanes[0]?.entries.map((entry) => entry.index)).toEqual([0]);
    expect(lanes[1]?.entries.map((entry) => entry.index)).toEqual([1, 2]);
    expect(lanes[2]?.entries.map((entry) => entry.index)).toEqual([3]);
    const gapColumns = 2 * (lanes.length - 1);
    const totalWidth = lanes.reduce((sum, lane) => sum + lane.width, 0) + gapColumns;
    expect(totalWidth).toBeLessThanOrEqual(140);
  });

  it('never produces a lane wider than the terminal even at a very narrow width', () => {
    const lanes = planPageGrid([TEXT, TOP_EIGHT], 82);
    for (const lane of lanes) expect(lane.width).toBeGreaterThanOrEqual(0);
    const totalWidth = lanes.reduce((sum, lane) => sum + lane.width, 0);
    expect(totalWidth).toBeLessThanOrEqual(82);
  });
});

describe('galleryColumnsFor', () => {
  it('mirrors the page width tiers', () => {
    expect(galleryColumnsFor(70)).toBe(1);
    expect(galleryColumnsFor(100)).toBe(2);
    expect(galleryColumnsFor(140)).toBe(3);
  });
});

describe('chunkIntoRows', () => {
  it('splits into rows of at most `columns`, preserving order', () => {
    expect(chunkIntoRows(['a', 'b', 'c', 'd', 'e'], 2)).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
  });

  it('is a single row when columns is 0 or negative', () => {
    expect(chunkIntoRows(['a', 'b'], 0)).toEqual([['a', 'b']]);
  });
});

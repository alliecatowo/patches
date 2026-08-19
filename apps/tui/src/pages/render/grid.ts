import type { RenderablePageBlock } from '@patches/domain';

import { STANDARD_MIN_COLUMNS, WIDE_MIN_COLUMNS } from '../../app/responsive-layout.js';

/** Mirrors `app/responsive-layout.ts`'s `WidthTier` breakpoints (`STANDARD_MIN_COLUMNS`/
 * `WIDE_MIN_COLUMNS`) rather than duplicating the numbers — a Page only ever needs three
 * buckets (P12-109: "narrow 1-col / standard 2 / wide 3"), so `'ultra'` folds into
 * `'wide'` here rather than adding a fourth column tier nothing in the design vision
 * calls for. */
export type PageWidthTier = 'narrow' | 'standard' | 'wide';

export function classifyPageWidth(width: number): PageWidthTier {
  if (width < STANDARD_MIN_COLUMNS) return 'narrow';
  if (width < WIDE_MIN_COLUMNS) return 'standard';
  return 'wide';
}

/** Column between adjacent lanes/gallery cells. */
export const GRID_GAP_COLUMNS = 2;

/** Block types the design vision (§5.5) puts in the right-hand rail rather than the
 * main column — compact actor/link lists, never a page's prose or media. */
const SIDEBAR_BLOCK_TYPES: ReadonlySet<RenderablePageBlock['type']> = new Set([
  'TopEight',
  'Badges',
  'Friends',
  'Links',
]);

export interface PageBlockEntry {
  block: RenderablePageBlock;
  /** This block's index in the sub-page's original `blocks` array — carried through
   * grid layout so `Links` selection (`PageScreen`'s `j`/`k`/`Enter`) and React `key`s
   * stay tied to document order, not to visual column. */
  index: number;
}

export interface PageGridLane {
  entries: readonly PageBlockEntry[];
  /** This lane's own width budget, in terminal cells — already net of the gaps
   * between lanes, so lane widths always sum to `totalWidth`. */
  width: number;
}

/**
 * Lays a sub-page's blocks out into 1–3 lanes by width tier (P12-109, design vision
 * §5.5): narrow is always a single column in document order; standard splits text-ish
 * blocks left from `TopEight`/`Badges`/`Friends`/`Links` right; wide splits that
 * sidebar further into two lanes once there is enough of it to be worth a third
 * column. A sub-page with no sidebar-shaped blocks stays single-column at every
 * tier — an empty lane is a layout bug, not "wide mode."
 */
export function planPageGrid(
  blocks: readonly RenderablePageBlock[],
  totalWidth: number,
): readonly PageGridLane[] {
  const entries = blocks.map((block, index): PageBlockEntry => ({ block, index }));
  const tier = classifyPageWidth(totalWidth);
  const sidebar = entries.filter((entry) => SIDEBAR_BLOCK_TYPES.has(entry.block.type));
  const main = entries.filter((entry) => !SIDEBAR_BLOCK_TYPES.has(entry.block.type));

  if (tier === 'narrow' || sidebar.length === 0) {
    return [{ entries, width: Math.max(0, totalWidth) }];
  }

  const columns = tier === 'wide' && sidebar.length >= 2 ? 3 : 2;
  const widths = planColumnWidths(totalWidth, columns);

  if (columns === 2) {
    return [
      { entries: main, width: widths[0] ?? totalWidth },
      { entries: sidebar, width: widths[1] ?? 0 },
    ];
  }

  const mid = Math.ceil(sidebar.length / 2);
  return [
    { entries: main, width: widths[0] ?? totalWidth },
    { entries: sidebar.slice(0, mid), width: widths[1] ?? 0 },
    { entries: sidebar.slice(mid), width: widths[2] ?? 0 },
  ];
}

/** The right-hand rail(s) get a third of the width; the main column keeps the rest —
 * always summing to exactly `totalWidth` minus the gaps rendered between lanes. */
const MAIN_LANE_SHARE = 0.6;

function planColumnWidths(totalWidth: number, columns: number): number[] {
  if (columns <= 1) return [Math.max(0, totalWidth)];
  const available = Math.max(0, totalWidth - GRID_GAP_COLUMNS * (columns - 1));
  const mainWidth = Math.max(1, Math.round(available * MAIN_LANE_SHARE));
  const remaining = Math.max(0, available - mainWidth);
  const sideColumns = columns - 1;
  const sideWidth = Math.floor(remaining / sideColumns);
  const widths = [mainWidth];
  for (let i = 0; i < sideColumns; i += 1) {
    widths.push(i === sideColumns - 1 ? remaining - sideWidth * (sideColumns - 1) : sideWidth);
  }
  return widths;
}

/** `Gallery` blocks (§5.5: "shows §75 boxes in a 2–3 column grid") share the same
 * tier→column mapping as the block grid itself, so a gallery never contradicts the
 * layout it sits inside. */
export function galleryColumnsFor(width: number): number {
  const tier = classifyPageWidth(width);
  if (tier === 'narrow') return 1;
  if (tier === 'standard') return 2;
  return 3;
}

/** Splits `items` into rows of at most `columns` each, preserving order. */
export function chunkIntoRows<T>(items: readonly T[], columns: number): readonly T[][] {
  if (columns <= 0) return [items.slice()];
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += columns) {
    rows.push(items.slice(i, i + columns));
  }
  return rows;
}

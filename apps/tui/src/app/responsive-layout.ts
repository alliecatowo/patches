export type WidthTier = 'narrow' | 'standard' | 'wide' | 'ultra';
export type HeightDensity = 'compact' | 'full';
export type LayoutMode = 'single' | 'split';

export interface LayoutPlan {
  widthTier: WidthTier;
  heightDensity: HeightDensity;
  contentColumns: number;
  contentRows: number;
  leftWidth: number;
  rightWidth: number;
  gap: number;
  mode: LayoutMode;
}

export const STANDARD_MIN_COLUMNS = 80;
export const WIDE_MIN_COLUMNS = 120;
export const ULTRA_MIN_COLUMNS = 160;
export const FULL_MIN_ROWS = 28;
export const SPLIT_GAP_COLUMNS = 1;
export const MIN_SPLIT_PANE_COLUMNS = 48;

/**
 * Converts a terminal size into presentation geometry only. Navigation state is
 * deliberately absent: resizing can change this plan, but cannot change history.
 */
export function planResponsiveLayout(
  width: number,
  height: number,
  requestedSplit = false,
): LayoutPlan {
  const contentColumns = terminalCells(width);
  const contentRows = terminalCells(height);
  const widthTier = classifyWidth(contentColumns);
  const heightDensity: HeightDensity = contentRows < FULL_MIN_ROWS ? 'compact' : 'full';
  const availablePaneColumns = contentColumns - SPLIT_GAP_COLUMNS;
  const leftWidth = Math.floor(availablePaneColumns / 2);
  const rightWidth = availablePaneColumns - leftWidth;
  const canSplit =
    requestedSplit &&
    (widthTier === 'wide' || widthTier === 'ultra') &&
    leftWidth >= MIN_SPLIT_PANE_COLUMNS &&
    rightWidth >= MIN_SPLIT_PANE_COLUMNS;

  if (!canSplit) {
    return {
      widthTier,
      heightDensity,
      contentColumns,
      contentRows,
      leftWidth: contentColumns,
      rightWidth: 0,
      gap: 0,
      mode: 'single',
    };
  }

  return {
    widthTier,
    heightDensity,
    contentColumns,
    contentRows,
    leftWidth,
    rightWidth,
    gap: SPLIT_GAP_COLUMNS,
    mode: 'split',
  };
}

function terminalCells(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function classifyWidth(columns: number): WidthTier {
  if (columns < STANDARD_MIN_COLUMNS) return 'narrow';
  if (columns < WIDE_MIN_COLUMNS) return 'standard';
  if (columns < ULTRA_MIN_COLUMNS) return 'wide';
  return 'ultra';
}

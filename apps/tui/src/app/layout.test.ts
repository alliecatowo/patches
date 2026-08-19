import { describe, expect, it } from 'vitest';

import { chromeSplit, FOOTER_ROWS, RIBBON_ROWS } from './layout.js';

describe('chromeSplit', () => {
  it('gives the whole footer budget to the bottom when no ribbon is drawn', () => {
    expect(chromeSplit(false)).toEqual({ ribbonRows: 0, footerRows: FOOTER_ROWS });
  });

  it('moves exactly RIBBON_ROWS to row 0 when a ribbon is drawn, budget-neutral', () => {
    const split = chromeSplit(true);
    expect(split.ribbonRows).toBe(RIBBON_ROWS);
    expect(split.ribbonRows + split.footerRows).toBe(FOOTER_ROWS);
  });
});

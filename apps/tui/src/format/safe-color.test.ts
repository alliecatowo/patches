import { describe, expect, it } from 'vitest';

import { safeInkColor } from './safe-color.js';

describe('safeInkColor', () => {
  it('passes valid colours', () => {
    for (const ok of ['#fff', '#7C3AED', 'magenta', 'ansi256(200)', 'rgb(1, 2, 3)'])
      expect(safeInkColor(ok)).toBe(ok);
  });
  it('rejects chalk property names and malformed values', () => {
    for (const bad of [
      'level',
      'toString',
      'hasOwnProperty',
      'supportsColor',
      '#12',
      'ansi256(999)',
      'rgb(1,2,300)',
      '',
      'constructor',
    ])
      expect(safeInkColor(bad)).toBeUndefined();
    expect(safeInkColor(undefined)).toBeUndefined();
  });
});

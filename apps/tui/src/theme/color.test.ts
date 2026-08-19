import { describe, expect, it } from 'vitest';

import {
  contrastRatio,
  nearestPickerColorIndex,
  normalizeHexColor,
  pickerColorAt,
  resolveTerminalColor,
  terminalContrastRatio,
} from './color.js';

describe('terminal color helpers', () => {
  it('normalizes only exact six-digit hex values', () => {
    expect(normalizeHexColor('#A1b2C3')).toBe('#a1b2c3');
    expect(normalizeHexColor('A1b2C3')).toBeNull();
    expect(normalizeHexColor('#fff')).toBeNull();
    expect(normalizeHexColor('#gg0000')).toBeNull();
  });

  it('indexes the 216-color picker cube deterministically', () => {
    expect(pickerColorAt(0)).toBe('#000000');
    expect(pickerColorAt(1)).toBe('#000033');
    expect(pickerColorAt(215)).toBe('#ffffff');
    expect(nearestPickerColorIndex('#010101')).toBe(0);
    expect(nearestPickerColorIndex('#fefefe')).toBe(215);
    expect(() => pickerColorAt(216)).toThrow(RangeError);
  });

  it('computes WCAG contrast ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 6);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.478, 3);
    expect(contrastRatio('#abcdef', '#abcdef')).toBe(1);
  });

  it('maps truecolor, xterm-256, ANSI-16, and text tiers exactly', () => {
    expect(resolveTerminalColor('#123456', 'truecolor')).toEqual({
      inkColor: '#123456',
      mappedHex: '#123456',
      label: '#123456',
    });
    expect(resolveTerminalColor('#ff0000', 'ansi256')).toEqual({
      inkColor: 'ansi256(9)',
      mappedHex: '#ff0000',
      label: 'ansi256(9)',
    });
    expect(resolveTerminalColor('#ff0000', 'ansi16')).toEqual({
      inkColor: 'redBright',
      mappedHex: '#ff0000',
      label: 'redBright',
    });
    expect(resolveTerminalColor('#123456', 'text')).toEqual({
      inkColor: null,
      mappedHex: '#123456',
      label: 'text only',
    });
  });

  it('uses mapped colors for tier-specific contrast', () => {
    expect(terminalContrastRatio('#010101', '#fefefe', 'ansi16')).toBe(21);
    expect(terminalContrastRatio('#010101', '#fefefe', 'text')).toBeCloseTo(20.7, 1);
  });
});

import { describe, expect, it } from 'vitest';

import { bgColor, detectColorSupport, fgColor, rgbToAnsi256 } from './color.js';

describe('detectColorSupport', () => {
  it('is none when NO_COLOR is present and non-empty, regardless of its value', () => {
    expect(detectColorSupport({ NO_COLOR: '0' })).toBe('none');
    expect(detectColorSupport({ NO_COLOR: '1', COLORTERM: 'truecolor' })).toBe('none');
  });

  it('does not disable colour for an empty NO_COLOR (no-color.org excludes it)', () => {
    expect(detectColorSupport({ NO_COLOR: '', TERM: 'xterm-256color' })).toBe('256');
  });

  it('is none for TERM=dumb or an unset TERM', () => {
    expect(detectColorSupport({ TERM: 'dumb' })).toBe('none');
    expect(detectColorSupport({})).toBe('none');
  });

  it('is truecolor only when COLORTERM says so', () => {
    expect(detectColorSupport({ TERM: 'xterm-256color', COLORTERM: 'truecolor' })).toBe(
      'truecolor',
    );
    expect(detectColorSupport({ TERM: 'xterm-256color', COLORTERM: '24bit' })).toBe('truecolor');
  });

  it('degrades to 256 when TERM is set but COLORTERM does not claim truecolor', () => {
    expect(detectColorSupport({ TERM: 'xterm-256color' })).toBe('256');
    expect(detectColorSupport({ TERM: 'screen', COLORTERM: 'gnome-terminal' })).toBe('256');
  });
});

describe('rgbToAnsi256', () => {
  it('maps pure black/white to the cube corners', () => {
    expect(rgbToAnsi256(0, 0, 0)).toBe(16);
    expect(rgbToAnsi256(255, 255, 255)).toBe(231);
  });

  it('uses the greyscale ramp for r===g===b, not the color cube', () => {
    // 128 is not one of the cube's 6 axis values, so a distinct grey index proves
    // the ramp branch (232-255) is taken rather than the general cube formula.
    const index = rgbToAnsi256(128, 128, 128);
    expect(index).toBeGreaterThanOrEqual(232);
    expect(index).toBeLessThanOrEqual(255);
  });

  it('stays within the 6x6x6 cube range for a saturated colour', () => {
    const index = rgbToAnsi256(200, 30, 90);
    expect(index).toBeGreaterThanOrEqual(16);
    expect(index).toBeLessThanOrEqual(231);
  });
});

describe('fgColor/bgColor', () => {
  it('emits 24-bit SGR for truecolor support', () => {
    expect(fgColor(10, 20, 30, 'truecolor')).toBe('\x1b[38;2;10;20;30m');
    expect(bgColor(10, 20, 30, 'truecolor')).toBe('\x1b[48;2;10;20;30m');
  });

  it('emits a quantized palette index for 256 support', () => {
    expect(fgColor(0, 0, 0, '256')).toBe('\x1b[38;5;16m');
    expect(bgColor(255, 255, 255, '256')).toBe('\x1b[48;5;231m');
  });
});

import { describe, expect, it } from 'vitest';

import { imagePolicyToRenderMode, resolveImageRenderMode } from './image-mode.js';

describe('resolveImageRenderMode', () => {
  it('defaults to auto when PATCHES_IMAGES is unset', () => {
    expect(resolveImageRenderMode({})).toBe('auto');
  });

  it.each(['auto', 'kitty', 'pixel', 'ascii', 'box', 'off'] as const)(
    'accepts PATCHES_IMAGES=%s',
    (mode) => {
      expect(resolveImageRenderMode({ PATCHES_IMAGES: mode })).toBe(mode);
    },
  );

  it('trims whitespace', () => {
    expect(resolveImageRenderMode({ PATCHES_IMAGES: '  pixel  ' })).toBe('pixel');
  });

  it('falls back to auto for an unrecognized value rather than throwing', () => {
    expect(resolveImageRenderMode({ PATCHES_IMAGES: 'sixel' })).toBe('auto');
  });
});

describe('imagePolicyToRenderMode', () => {
  it.each(['auto', 'pixel', 'ascii', 'box', 'off'] as const)('maps %s 1:1', (policy) => {
    expect(imagePolicyToRenderMode(policy)).toBe(policy);
  });
});

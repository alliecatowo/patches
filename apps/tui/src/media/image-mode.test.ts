import { describe, expect, it } from 'vitest';

import {
  imagePolicyToRenderMode,
  resolveEffectiveImageRenderMode,
  resolveImageRenderMode,
} from './image-mode.js';

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

describe('resolveEffectiveImageRenderMode (env > saved preference > auto)', () => {
  it('falls back to auto when nothing is set', () => {
    expect(resolveEffectiveImageRenderMode({}, undefined)).toBe('auto');
  });

  it('uses the saved preference when there is no env override', () => {
    expect(resolveEffectiveImageRenderMode({}, 'ascii')).toBe('ascii');
  });

  it('prefers PATCHES_IMAGES over a saved preference', () => {
    expect(resolveEffectiveImageRenderMode({ PATCHES_IMAGES: 'box' }, 'ascii')).toBe('box');
  });

  it('falls through an unrecognized env value to the saved preference, not auto', () => {
    expect(resolveEffectiveImageRenderMode({ PATCHES_IMAGES: 'sixel' }, 'pixel')).toBe('pixel');
  });

  it('falls through an unrecognized env value to auto when nothing is saved', () => {
    expect(resolveEffectiveImageRenderMode({ PATCHES_IMAGES: 'sixel' }, undefined)).toBe('auto');
  });

  it('ignores an empty env var the same way resolveImageRenderMode does', () => {
    expect(resolveEffectiveImageRenderMode({ PATCHES_IMAGES: '' }, 'off')).toBe('off');
  });
});

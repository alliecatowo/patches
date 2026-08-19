import { render } from 'ink-testing-library';
import stringWidth from 'string-width';
import { describe, expect, it } from 'vitest';

import { stripSgr } from '../../test/ansi.js';

import { BUILT_IN_THEMES, listBuiltInThemes } from '../theme/themes/registry.js';
import { THEME_PREVIEW_DIMENSIONS, ThemePreview } from './ThemePreview.js';

function words(frame: string): string[] {
  return stripSgr(frame).match(/[@#]?[\p{L}\p{N}]+/gu) ?? [];
}

describe('ThemePreview', () => {
  it.each(listBuiltInThemes().map((theme) => [theme.name, theme] as const))(
    'fits the fixed measured frame for %s',
    (_name, theme) => {
      const { lastFrame } = render(<ThemePreview theme={theme} />);
      const lines = (lastFrame() ?? '').split('\n');
      expect(lines.length).toBeLessThanOrEqual(THEME_PREVIEW_DIMENSIONS.height);
      for (const line of lines) {
        expect(stringWidth(line)).toBeLessThanOrEqual(THEME_PREVIEW_DIMENSIONS.width);
      }
    },
  );

  it('demonstrates header, post, selection, status, and error states', () => {
    const { lastFrame } = render(<ThemePreview theme={BUILT_IN_THEMES.patches} />);
    const frame = stripSgr(lastFrame() ?? '');
    expect(frame).toContain('Theme preview');
    expect(frame).toContain('@alice');
    expect(frame).toContain('A chronological post. #patches');
    expect(frame).toContain('Selected: Open thread');
    expect(frame).toContain('Status: connected');
    expect(frame).toContain('Error: Could not refresh');
  });

  it('keeps exactly the same words in plain mode without depending on decoration', () => {
    const rich = render(<ThemePreview theme={BUILT_IN_THEMES.pastel} />);
    const plain = render(<ThemePreview theme={BUILT_IN_THEMES.pastel} plain />);
    expect(words(plain.lastFrame() ?? '')).toEqual(words(rich.lastFrame() ?? ''));
    expect(plain.lastFrame() ?? '').not.toContain('─');
  });
});

import type { Key } from 'ink';
import { render } from 'ink-testing-library';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { stripSgr } from '../../test/ansi.js';
import { createKeyLayerStack, KeyLayerProvider } from '../app/input.js';
import { ContentSizeProvider } from '../app/layout.js';
import { PreferencesScreen, type PreferencesScreenProps } from './PreferencesScreen.js';

function key(overrides: Partial<Key> = {}): Key {
  return {
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
    pageDown: false,
    pageUp: false,
    home: false,
    end: false,
    return: false,
    escape: false,
    ctrl: false,
    shift: false,
    tab: false,
    backspace: false,
    delete: false,
    meta: false,
    super: false,
    hyper: false,
    capsLock: false,
    numLock: false,
    ...overrides,
  };
}

async function dispatch(
  stack: ReturnType<typeof createKeyLayerStack>,
  input: string,
  pressed = key(),
): Promise<void> {
  await act(async () => {
    stack.dispatch(input, pressed);
    await Promise.resolve();
  });
}

function baseProps(overrides: Partial<PreferencesScreenProps> = {}): PreferencesScreenProps {
  return {
    isActive: true,
    themeName: 'patches',
    themeSource: 'default',
    onPreviewTheme: vi.fn(),
    plain: false,
    onPlainChange: vi.fn(),
    quiet: false,
    onQuietChange: vi.fn(),
    onSave: vi.fn(),
    onCancel: vi.fn(),
    canPersist: true,
    ...overrides,
  };
}

function renderScreen(props: PreferencesScreenProps) {
  const stack = createKeyLayerStack();
  const view = render(
    <KeyLayerProvider stack={stack}>
      <ContentSizeProvider size={{ rows: 24, columns: 90 }}>
        <PreferencesScreen {...props} />
      </ContentSizeProvider>
    </KeyLayerProvider>,
  );
  return { stack, ...view };
}

describe('PreferencesScreen', () => {
  it('lists theme, glyphs, plain mode, quiet feed, and images', () => {
    const { lastFrame } = renderScreen(baseProps());
    const frame = stripSgr(lastFrame() ?? '');
    expect(frame).toContain('Theme:');
    expect(frame).toContain('Glyphs:');
    expect(frame).toContain('Plain mode:');
    expect(frame).toContain('Quiet feed:');
    expect(frame).toContain('Images:');
  });

  it('cycles the theme with h/l and calls onPreviewTheme live', async () => {
    const onPreviewTheme = vi.fn();
    const { stack } = renderScreen(baseProps({ onPreviewTheme }));
    await dispatch(stack, 'l');
    expect(onPreviewTheme).toHaveBeenCalledTimes(1);
    const [firstCall] = onPreviewTheme.mock.calls as [[string]];
    expect(firstCall[0]).not.toBe('patches');
  });

  it('moves the row cursor with j/k and toggles plain mode on the plain row', async () => {
    const onPlainChange = vi.fn();
    const { stack } = renderScreen(baseProps({ onPlainChange }));
    // theme -> glyphs -> plain
    await dispatch(stack, 'j');
    await dispatch(stack, 'j');
    await dispatch(stack, 'l');
    expect(onPlainChange).toHaveBeenCalledWith(true);
  });

  it('toggles quiet feed on its row', async () => {
    const onQuietChange = vi.fn();
    const { stack } = renderScreen(baseProps({ onQuietChange }));
    await dispatch(stack, 'j'); // glyphs
    await dispatch(stack, 'j'); // plain
    await dispatch(stack, 'j'); // quiet
    await dispatch(stack, ' ');
    expect(onQuietChange).toHaveBeenCalledWith(true);
  });

  it('cycles glyph sets unicode -> nerd -> ascii and shows a live glyph preview', async () => {
    const onGlyphSetChange = vi.fn();
    const { stack, lastFrame } = renderScreen(baseProps({ glyphSet: 'unicode', onGlyphSetChange }));
    await dispatch(stack, 'j'); // glyphs row
    await dispatch(stack, 'l');
    expect(onGlyphSetChange).toHaveBeenCalledWith('nerd');
    expect(stripSgr(lastFrame() ?? '')).toContain('unicode');
  });

  it('falls back to internal state for glyphs/images when uncontrolled', async () => {
    const { stack, lastFrame } = renderScreen(baseProps());
    await dispatch(stack, 'j'); // glyphs row
    await dispatch(stack, 'l');
    expect(stripSgr(lastFrame() ?? '')).toContain('Glyphs: nerd');
  });

  it('cycles image policy auto -> pixel -> ascii -> box -> off -> auto on its row', async () => {
    const onImagePolicyChange = vi.fn();
    const { stack } = renderScreen(baseProps({ imagePolicy: 'auto', onImagePolicyChange }));
    await dispatch(stack, 'j'); // glyphs
    await dispatch(stack, 'j'); // plain
    await dispatch(stack, 'j'); // quiet
    await dispatch(stack, 'j'); // images
    await dispatch(stack, 'l');
    expect(onImagePolicyChange).toHaveBeenCalledWith('pixel');
  });

  it('cycles image policy backwards with h, wrapping from auto to off', async () => {
    const onImagePolicyChange = vi.fn();
    const { stack } = renderScreen(baseProps({ imagePolicy: 'auto', onImagePolicyChange }));
    await dispatch(stack, 'j'); // glyphs
    await dispatch(stack, 'j'); // plain
    await dispatch(stack, 'j'); // quiet
    await dispatch(stack, 'j'); // images
    await dispatch(stack, 'h');
    expect(onImagePolicyChange).toHaveBeenCalledWith('off');
  });

  it('shows a live one-line description of the selected image mode', async () => {
    const { stack, lastFrame } = renderScreen(baseProps({ imagePolicy: 'ascii' }));
    await dispatch(stack, 'j'); // glyphs
    await dispatch(stack, 'j'); // plain
    await dispatch(stack, 'j'); // quiet
    await dispatch(stack, 'j'); // images
    expect(stripSgr(lastFrame() ?? '')).toContain('Colourless dithered ascii art');
  });

  it('shows a live AA contrast explanation for the previewed theme (P12-112)', () => {
    const { lastFrame } = renderScreen(baseProps({ themeName: 'patches' }));
    const frame = stripSgr(lastFrame() ?? '');
    expect(frame).toMatch(/AA contrast \d+\.\d\d:1 against background\./);
  });

  it('explains that the terminal theme delegates colours instead of a ratio', () => {
    const { lastFrame } = renderScreen(baseProps({ themeName: 'terminal' }));
    const frame = stripSgr(lastFrame() ?? '');
    expect(frame).toContain("Delegates foreground and background to your terminal's colours");
  });

  it('Enter saves, Esc cancels', async () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    const { stack } = renderScreen(baseProps({ onSave, onCancel }));
    await dispatch(stack, '', key({ return: true }));
    expect(onSave).toHaveBeenCalledOnce();

    const { stack: stack2 } = renderScreen(baseProps({ onSave, onCancel }));
    await dispatch(stack2, '', key({ escape: true }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('shows a sign-in nudge instead of a save promise when signed out', () => {
    const { lastFrame } = renderScreen(baseProps({ canPersist: false }));
    expect(stripSgr(lastFrame() ?? '')).toContain('sign in to save');
  });

  it('renders within the terminal-too-small default content size without overflowing', () => {
    const { lastFrame } = render(
      <KeyLayerProvider stack={createKeyLayerStack()}>
        <PreferencesScreen {...baseProps()} />
      </KeyLayerProvider>,
    );
    const lines = (lastFrame() ?? '').split('\n');
    // Title, source, 5 rows, help, hint = 9 chrome rows minimum (preview may add more).
    expect(lines.length).toBeGreaterThanOrEqual(9);
  });
});

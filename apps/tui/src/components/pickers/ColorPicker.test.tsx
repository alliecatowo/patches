import stringWidth from 'string-width';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import { COLOR_PICKER_ROWS, ColorPicker, type ColorPickerProps } from './ColorPicker.js';

const KEY = {
  right: '\u001B[C',
  down: '\u001B[B',
  enter: '\r',
  tab: '\t',
  escape: '\u001B',
} as const;

function picker(overrides: Partial<ColorPickerProps> = {}) {
  return (
    <ColorPicker
      initialColor="#000000"
      comparisonColor="#ffffff"
      capabilityTier="text"
      onChange={() => undefined}
      onCommit={() => undefined}
      onCancel={() => undefined}
      {...overrides}
    />
  );
}

describe('ColorPicker', () => {
  it('navigates the measured 216-swatch grid with arrows and hjkl, then commits on Enter', () => {
    const onChange = vi.fn<(color: string) => void>();
    const onCommit = vi.fn();
    const rendered = render(picker({ onChange, onCommit }));

    rendered.stdin.write(KEY.right);
    expect(onChange).toHaveBeenLastCalledWith('#000033');
    rendered.stdin.write('j');
    expect(onChange).toHaveBeenLastCalledWith('#330033');
    rendered.stdin.write('k');
    rendered.stdin.write('h');
    expect(onChange).toHaveBeenLastCalledWith('#000000');
    rendered.stdin.write(KEY.down);
    rendered.stdin.write(KEY.enter);
    expect(onCommit).toHaveBeenCalledWith('#330000');
  });

  it('Escape reverses a valid live preview, cancels, and never commits', async () => {
    const onChange = vi.fn<(color: string) => void>();
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    const rendered = render(picker({ onChange, onCommit, onCancel }));

    rendered.stdin.write(KEY.right);
    rendered.stdin.write(KEY.escape);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(onChange.mock.calls.map(([color]) => color)).toEqual(['#000033', '#000000']);
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('rejects exact hex below 4.5:1 with a visible explanation', async () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    const rendered = render(picker({ capabilityTier: 'truecolor', onChange, onCommit }));

    rendered.stdin.write(KEY.tab);
    await settle();
    rendered.stdin.write('#777777');
    await settle();
    rendered.stdin.write(KEY.enter);
    await settle();
    const frame = rendered.lastFrame() ?? '';
    expect(frame).toContain('current #777777');
    expect(frame).toContain('Contrast: 4.48:1');
    expect(frame).toContain('Rejected: 4.48:1 is below 4.50:1');
    expect(onChange).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('allows low-contrast decoration-only colors explicitly', async () => {
    const onCommit = vi.fn();
    const rendered = render(
      picker({ capabilityTier: 'truecolor', decorationOnly: true, onCommit }),
    );

    rendered.stdin.write(KEY.tab);
    await settle();
    rendered.stdin.write('#777777');
    await settle();
    rendered.stdin.write(KEY.enter);
    await settle();
    expect(rendered.lastFrame()).toContain(
      'Decoration only: readable-text contrast check bypassed.',
    );
    expect(onCommit).toHaveBeenCalledWith('#777777');
  });

  it.each([
    ['truecolor', 'truecolor', 'output #112233'],
    ['ansi256', '256-color', 'output ansi256('],
    ['ansi16', '16-color', 'output black'],
    ['text', 'text only', 'output text only'],
  ] as const)(
    'renders the %s degradation tier in an exact bounded frame',
    (tier, label, output) => {
      const rendered = render(
        picker({
          initialColor: '#112233',
          comparisonColor: '#ffffff',
          capabilityTier: tier,
          columns: 72,
        }),
      );
      const frame = rendered.lastFrame() ?? '';
      const rows = frame.split('\n');
      expect(frame).toContain(label);
      expect(frame).toContain(output);
      expect(rows).toHaveLength(COLOR_PICKER_ROWS);
      expect(rows.every((row) => stringWidth(row) <= 72)).toBe(true);
    },
  );
});

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

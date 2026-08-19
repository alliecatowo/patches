import { Text } from 'ink';
import { render } from 'ink-testing-library';
import type { ReactElement } from 'react';
import stringWidth from 'string-width';
import { describe, expect, it } from 'vitest';

import { SplitPane, type SplitPaneProps } from './SplitPane.js';

function view(overrides: Partial<SplitPaneProps> = {}): ReactElement {
  return (
    <SplitPane
      width={120}
      height={6}
      primary={<Text>first-child</Text>}
      secondary={<Text>second-child</Text>}
      focusedPane="primary"
      primaryTitle="Timeline"
      secondaryTitle="Detail"
      requestedSplit
      {...overrides}
    />
  );
}

function expectFixedFrame(frame: string | undefined, width: number, height: number): string[] {
  expect(frame).toBeDefined();
  const lines = (frame ?? '').split('\n');
  expect(lines).toHaveLength(height);
  for (const line of lines) expect(stringWidth(line)).toBeLessThanOrEqual(width);
  return lines;
}

describe('SplitPane', () => {
  it('renders a clipped primary-only frame below the split threshold', () => {
    const rendered = render(
      view({
        width: 79,
        primary: <Text>{'primary '.repeat(100)}</Text>,
        secondary: <Text>secondary-must-not-render</Text>,
        focusedPane: 'secondary',
      }),
    );

    const lines = expectFixedFrame(rendered.lastFrame(), 79, 6);
    expect(lines[0]).toContain('> Timeline');
    expect(lines.join('\n')).not.toContain('secondary-must-not-render');
    rendered.unmount();
  });

  it('renders a clipped wide split inside the exact passed budget', () => {
    const rendered = render(
      view({
        primary: <Text>{'primary '.repeat(100)}</Text>,
        secondary: <Text>{'secondary '.repeat(100)}</Text>,
      }),
    );

    const lines = expectFixedFrame(rendered.lastFrame(), 120, 6);
    expect(lines.every((line) => line.includes('│'))).toBe(true);
    expect(lines.join('\n')).toContain('primary');
    expect(lines.join('\n')).toContain('secondary');
    rendered.unmount();
  });

  it('marks focus with readable text independently of color', () => {
    const rendered = render(view());
    expect(rendered.lastFrame()).toContain('> Timeline');
    expect(rendered.lastFrame()).not.toContain('> Detail');

    rendered.rerender(view({ focusedPane: 'secondary' }));
    expect(rendered.lastFrame()).not.toContain('> Timeline');
    expect(rendered.lastFrame()).toContain('> Detail');
    rendered.unmount();
  });

  it('keeps the supplied children in primary-then-secondary order across resize plans', () => {
    const primary = <Text>first-child</Text>;
    const secondary = <Text>second-child</Text>;
    const panes = { primary, secondary };
    const rendered = render(view(panes));
    const wide = rendered.lastFrame() ?? '';
    expect(wide.indexOf('first-child')).toBeLessThan(wide.indexOf('second-child'));

    rendered.rerender(view({ ...panes, width: 79 }));
    expect(rendered.lastFrame()).toContain('first-child');
    expect(rendered.lastFrame()).not.toContain('second-child');

    rendered.rerender(view({ ...panes, width: 160 }));
    const ultra = rendered.lastFrame() ?? '';
    expect(ultra.indexOf('first-child')).toBeLessThan(ultra.indexOf('second-child'));
    rendered.unmount();
  });

  it('honors an explicit single-pane request even at wide sizes', () => {
    const rendered = render(view({ requestedSplit: false }));
    expect(rendered.lastFrame()).toContain('first-child');
    expect(rendered.lastFrame()).not.toContain('second-child');
    rendered.unmount();
  });
});

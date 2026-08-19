import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import stringWidth from 'string-width';

import { PlainModeProvider } from '../theme/plain-mode.js';
import { HintLine, StatusBar } from './StatusBar.js';

describe('StatusBar', () => {
  it('is exactly one row, hard-clipped to width', () => {
    const { lastFrame } = render(
      <StatusBar
        target="patches.social"
        breadcrumb={['patches', 'Home']}
        connection="ready"
        width={40}
      />,
    );
    const lines = (lastFrame() ?? '').split('\n');
    expect(lines).toHaveLength(1);
    expect(stringWidth(lines[0] ?? '')).toBeLessThanOrEqual(40);
  });

  it('shows the breadcrumb path and the node host', () => {
    const { lastFrame } = render(
      <StatusBar
        target="patches.social"
        breadcrumb={['patches', 'Home', 'Thread']}
        connection="ready"
        width={80}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('patches › Home › Thread');
    expect(frame).toContain('patches.social');
  });

  it('renders the connection dot for each state', () => {
    for (const [connection, glyph] of [
      ['ready', '●'],
      ['connecting', '◐'],
      ['error', '○'],
    ] as const) {
      const { lastFrame } = render(
        <StatusBar target="t" breadcrumb={['patches']} connection={connection} width={40} />,
      );
      expect(lastFrame()).toContain(glyph);
    }
  });

  it('falls back to words, never glyphs, in plain mode', () => {
    const { lastFrame } = render(
      <PlainModeProvider plain>
        <StatusBar target="t" breadcrumb={['patches', 'Home']} connection="error" width={40} />
      </PlainModeProvider>,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('offline');
    expect(frame).not.toContain('○');
    expect(frame).toContain('patches > Home');
  });

  it('renders the unread pill only when the count is greater than zero', () => {
    const withCount = render(
      <StatusBar
        target="t"
        breadcrumb={['patches']}
        connection="ready"
        width={40}
        unreadCount={3}
      />,
    );
    expect(withCount.lastFrame()).toContain('✉ 3');

    const zero = render(
      <StatusBar
        target="t"
        breadcrumb={['patches']}
        connection="ready"
        width={40}
        unreadCount={0}
      />,
    );
    expect(zero.lastFrame()).not.toContain('✉');

    const signedOut = render(
      <StatusBar target="t" breadcrumb={['patches']} connection="ready" width={40} />,
    );
    expect(signedOut.lastFrame()).not.toContain('✉');
  });

  it('shows a bounded spinner in the connection slot while refreshing, never the dot', () => {
    const { lastFrame } = render(
      <StatusBar target="t" breadcrumb={['patches']} connection="ready" width={40} refreshing />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).not.toContain('●');
  });

  it('shows the handle when signed in, omits it when signed out', () => {
    const signedIn = render(
      <StatusBar
        target="t"
        breadcrumb={['patches']}
        connection="ready"
        width={40}
        handle="alice"
      />,
    );
    expect(signedIn.lastFrame()).toContain('@alice');

    const signedOut = render(
      <StatusBar target="t" breadcrumb={['patches']} connection="ready" width={40} />,
    );
    expect(signedOut.lastFrame()).not.toContain('@');
  });
});

describe('HintLine', () => {
  it('is exactly one row, truncated to width, never wrapping', () => {
    const { lastFrame } = render(
      <HintLine keys={['j/k move', 'Enter thread', 'c post', 'r reply', '? help']} width={20} />,
    );
    const lines = (lastFrame() ?? '').split('\n');
    expect(lines).toHaveLength(1);
    expect(stringWidth(lines[0] ?? '')).toBeLessThanOrEqual(20);
  });
});

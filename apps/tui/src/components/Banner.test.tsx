import { render } from 'ink-testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlainModeProvider } from '../theme/plain-mode.js';
import { Banner, StickyNewCount } from './Banner.js';

describe('Banner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is always exactly one row (the reserved notice row)', () => {
    const { lastFrame } = render(<Banner title="offline" retryAt={undefined} />);
    expect((lastFrame() ?? '').split('\n')).toHaveLength(1);
  });

  it('shows the title and the Ctrl+R hint', () => {
    const { lastFrame } = render(<Banner title="Can't reach the server." retryAt={undefined} />);
    expect(lastFrame()).toContain("Can't reach the server.");
    expect(lastFrame()).toContain('Ctrl+R');
  });

  it('counts down live to the scheduled retry', async () => {
    const { lastFrame } = render(<Banner title="offline" retryAt={4000} />);
    expect(lastFrame()).toContain('retrying in 4s');

    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => expect(lastFrame()).toContain('retrying in 3s'));

    await vi.advanceTimersByTimeAsync(3000);
    await vi.waitFor(() => expect(lastFrame()).toContain('retrying in 0s'));
  });

  it('omits the countdown entirely for a non-retryable failure', () => {
    const { lastFrame } = render(<Banner title="permission denied" retryAt={undefined} />);
    expect(lastFrame()).not.toContain('retrying in');
  });

  it('drops the glyph in plain mode but keeps every word', () => {
    const rich = render(<Banner title="offline" retryAt={undefined} />).lastFrame() ?? '';
    const plainFrame =
      render(
        <PlainModeProvider plain>
          <Banner title="offline" retryAt={undefined} />
        </PlainModeProvider>,
      ).lastFrame() ?? '';
    expect(rich).toContain('●');
    expect(plainFrame).not.toContain('●');
    expect(plainFrame).toContain('offline');
    expect(plainFrame).toContain('Ctrl+R');
  });
});

describe('StickyNewCount', () => {
  it('renders nothing at zero', () => {
    const { lastFrame } = render(<StickyNewCount count={0} />);
    expect(lastFrame()).toBe('');
  });

  it('shows the count and the default clear hint', () => {
    const { lastFrame } = render(<StickyNewCount count={7} />);
    expect(lastFrame()).toContain('7 new');
    expect(lastFrame()).toContain('g g');
    expect(lastFrame()).toContain('↑');
  });

  it('accepts a screen-specific clear hint', () => {
    const { lastFrame } = render(<StickyNewCount count={3} clearHint="Ctrl+R" />);
    expect(lastFrame()).toContain('Ctrl+R');
  });

  it('drops the glyph in plain mode but keeps the count and hint', () => {
    const { lastFrame } = render(
      <PlainModeProvider plain>
        <StickyNewCount count={2} />
      </PlainModeProvider>,
    );
    expect(lastFrame()).not.toContain('↑');
    expect(lastFrame()).toContain('2 new');
    expect(lastFrame()).toContain('g g');
  });
});

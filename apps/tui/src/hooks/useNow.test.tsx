import { Text } from 'ink';
import { render } from 'ink-testing-library';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NowProvider, useNow } from './useNow.js';

function Clock(): ReactElement {
  const now = useNow();
  return <Text>{now.toISOString()}</Text>;
}

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a fresh Date() outside a provider rather than throwing', () => {
    const { lastFrame } = render(<Clock />);
    expect(lastFrame()).toContain('2026-01-01T00:00:00');
  });

  it('ticks on the shared interval and stays put between ticks', async () => {
    const { lastFrame } = render(
      <NowProvider>
        <Clock />
      </NowProvider>,
    );
    expect(lastFrame()).toContain('2026-01-01T00:00:00.000Z');

    await vi.advanceTimersByTimeAsync(29_000);
    expect(lastFrame()).toContain('2026-01-01T00:00:00.000Z');

    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => expect(lastFrame()).toContain('2026-01-01T00:00:30.000Z'));
  });

  it('never starts more than one interval no matter how many consumers read it', () => {
    function TwoClocks(): ReactElement {
      return (
        <>
          <Clock />
          <Clock />
        </>
      );
    }
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    render(
      <NowProvider>
        <TwoClocks />
      </NowProvider>,
    );
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
  });

  it('honours a custom tick interval for tests', async () => {
    const { lastFrame } = render(
      <NowProvider tickMs={1000}>
        <Clock />
      </NowProvider>,
    );
    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => expect(lastFrame()).toContain('2026-01-01T00:00:01.000Z'));
  });
});

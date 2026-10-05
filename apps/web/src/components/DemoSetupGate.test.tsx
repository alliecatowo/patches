import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DemoSeeding } from '../demo/useDemoSeeding.js';

let seeding: DemoSeeding;
const clearSeedPlan = vi.fn();

vi.mock('../hooks/useSession.js', () => ({ useSession: () => null }));
vi.mock('../demo/useDemoSeeding.js', () => ({ useDemoSeeding: () => seeding }));
vi.mock('../demo/demo-mode.js', () => ({
  clearSeedPlan: (): void => {
    clearSeedPlan();
  },
}));

const { default: DemoSetupGate } = await import('./DemoSetupGate.js');

function make(over: Partial<DemoSeeding>): DemoSeeding {
  return {
    state: 'running',
    step: 'friends',
    friendsDone: 1,
    friendsTotal: 3,
    error: undefined,
    retry: vi.fn(),
    ...over,
  };
}

describe('DemoSetupGate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    clearSeedPlan.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows live friend progress while sealing', () => {
    seeding = make({});
    render(<DemoSetupGate onFinished={vi.fn()} />);
    expect(
      screen.getAllByText(/friends are sending you messages \(1\/3\)/i).length,
    ).toBeGreaterThan(0);
  });

  it('shows ready, then opens the inbox once sealing is done', () => {
    seeding = make({ state: 'done', step: 'ready', friendsDone: 3 });
    const onFinished = vi.fn();
    render(<DemoSetupGate onFinished={onFinished} />);
    expect(onFinished).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('skips the hold under reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    seeding = make({ state: 'done', step: 'ready', friendsDone: 3 });
    const onFinished = vi.fn();
    render(<DemoSetupGate onFinished={onFinished} />);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('passes straight through when there is nothing to seed', () => {
    seeding = make({ state: 'idle' });
    const onFinished = vi.fn();
    const { container } = render(<DemoSetupGate onFinished={onFinished} />);
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers retry and continue-without-messages on failure', () => {
    seeding = make({ state: 'failed', error: 'Your friends could not send their messages.' });
    const onFinished = vi.fn();
    render(<DemoSetupGate onFinished={onFinished} />);
    expect(screen.getByRole('alert')).toHaveTextContent('could not send');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(seeding.retry).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Continue without messages' }));
    expect(clearSeedPlan).toHaveBeenCalledTimes(1);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });
});

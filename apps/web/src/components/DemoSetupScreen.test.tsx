import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DemoSetupScreen } from './DemoSetupScreen.js';

function step(name: RegExp): HTMLElement {
  const item = within(screen.getByRole('list')).getByText(name).closest('li');
  if (item === null) throw new Error('step row not found');
  return item;
}

describe('DemoSetupScreen', () => {
  it('marks earlier steps done, the current one active, and counts friends', () => {
    render(<DemoSetupScreen phase="friends" friendsDone={2} friendsTotal={3} />);
    expect(screen.getByRole('dialog', { name: 'Setting up your sandbox' })).toBeInTheDocument();
    expect(step(/creating your account/i)).toHaveTextContent('done');
    expect(step(/generating your encryption keys/i)).toHaveTextContent('done');
    expect(step(/friends are sending you messages \(2\/3\)/i)).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(step(/^ready/i)).toHaveTextContent('waiting');
  });

  it('shows every step done at ready', () => {
    render(<DemoSetupScreen phase="ready" friendsDone={3} friendsTotal={3} />);
    expect(step(/^ready/i)).toHaveTextContent('done');
    expect(step(/friends are sending you messages \(3\/3\)/i)).toHaveTextContent('done');
  });

  it('shows the failing step, the message and working retry and leave actions', () => {
    const onRetry = vi.fn();
    const onLeave = vi.fn();
    render(
      <DemoSetupScreen
        phase="keys"
        friendsDone={0}
        friendsTotal={3}
        error="Your encryption keys could not be set up."
        onRetry={onRetry}
        onLeave={onLeave}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('could not be set up');
    expect(step(/generating your encryption keys/i)).toHaveTextContent('failed');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('omits retry when it cannot help', () => {
    render(
      <DemoSetupScreen
        phase="account"
        friendsDone={0}
        friendsTotal={3}
        error="Too many demos."
        canRetry={false}
        onRetry={vi.fn()}
        onLeave={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});

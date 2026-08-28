import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Composer } from './Composer.js';

describe('Composer', () => {
  it('sends on Enter and keeps the newline on Shift+Enter', () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} />);
    const textarea = screen.getByLabelText('Message body');

    fireEvent.change(textarea, { target: { value: 'hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('hello');
  });

  it('never sends an empty/whitespace-only draft', () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} />);
    const textarea = screen.getByLabelText('Message body');

    fireEvent.change(textarea, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('shows a failed state with a retry action instead of silently dropping the send', () => {
    const onRetry = vi.fn();
    render(<Composer onSend={vi.fn()} status="failed" onRetry={onRetry} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Message failed to send.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('disables the form while a send is in flight', () => {
    render(<Composer onSend={vi.fn()} status="sending" />);
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
  });
});

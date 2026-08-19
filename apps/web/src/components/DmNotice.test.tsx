import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DmNotice } from './DmNotice.js';

describe('DmNotice', () => {
  it('shows the mandatory not-E2E-encrypted disclosure (Amendment B §183.1)', () => {
    render(<DmNotice />);
    expect(
      screen.getByText("Not end-to-end encrypted — this node's operators can read these messages."),
    ).toBeInTheDocument();
  });

  it('never uses the words "encrypted", "secure", or "private" to describe DMs positively', () => {
    render(<DmNotice />);
    const text = screen.getByRole('note').textContent ?? '';
    expect(text).not.toMatch(/\bsecure\b/i);
    expect(text).not.toMatch(/\bprivate\b/i);
  });
});

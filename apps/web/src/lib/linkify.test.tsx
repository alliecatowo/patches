import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { linkifyBody } from './linkify.js';

function renderBody(body: string) {
  return render(<MemoryRouter>{linkifyBody(body)}</MemoryRouter>);
}

describe('linkifyBody', () => {
  it('turns a bare URL into a real link, never via dangerouslySetInnerHTML', () => {
    renderBody('check this out https://example.com/x thanks');
    const link = screen.getByRole('link', { name: 'https://example.com/x' });
    expect(link).toHaveAttribute('href', 'https://example.com/x');
    expect(link.getAttribute('rel') ?? '').toContain('noopener');
  });

  it('turns a #tag token into a link to /t/:tag', () => {
    renderBody('loving #patches today');
    const link = screen.getByRole('link', { name: '#patches' });
    expect(link).toHaveAttribute('href', '/t/patches');
  });

  it('renders plain text with no links untouched', () => {
    const { container } = renderBody('just plain text, nothing special');
    expect(container).toHaveTextContent('just plain text, nothing special');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

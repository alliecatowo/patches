import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { RichBody } from './RichBody.js';

function renderBody(source: string) {
  return render(
    <MemoryRouter>
      <RichBody source={source} />
    </MemoryRouter>,
  );
}

describe('RichBody', () => {
  it('renders markdown emphasis/strong without dangerouslySetInnerHTML', () => {
    const { container } = renderBody('this is **bold** and *italic*');
    expect(container.querySelector('strong')).toHaveTextContent('bold');
    expect(container.querySelector('em')).toHaveTextContent('italic');
    expect(container.innerHTML).not.toContain('**');
  });

  it('links a #tag to /t/:tag', () => {
    renderBody('loving #patches today');
    const link = screen.getByRole('link', { name: '#patches' });
    expect(link).toHaveAttribute('href', '/t/patches');
  });

  it('links an @mention to /@handle', () => {
    renderBody('hey @allie check this out');
    const link = screen.getByRole('link', { name: '@allie' });
    expect(link).toHaveAttribute('href', '/@allie');
  });

  it('renders a safe bare URL as a link with noopener', () => {
    renderBody('see https://example.com/x for details');
    const link = screen.getByRole('link', { name: 'https://example.com/x' });
    expect(link).toHaveAttribute('href', 'https://example.com/x');
    expect(link.getAttribute('rel') ?? '').toContain('noopener');
  });

  it('never activates a javascript: link', () => {
    renderBody('[click me](javascript:alert(1))');
    expect(screen.queryByRole('link', { name: 'click me' })).not.toBeInTheDocument();
  });

  it('renders hard line breaks within a paragraph', () => {
    const { container } = renderBody('line one\nline two');
    expect(container.querySelectorAll('br')).toHaveLength(1);
  });
});

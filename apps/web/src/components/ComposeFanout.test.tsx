import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ComposeFanout } from './ComposeFanout.js';

describe('ComposeFanout', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <MemoryRouter>
        <ComposeFanout isOpen={false} onClose={vi.fn()} />
      </MemoryRouter>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders actions and calls onClose when clicking close button or pressing Escape', () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <ComposeFanout isOpen={true} onClose={onClose} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('dialog', { name: 'Create new' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Write Post/i })).toHaveAttribute('href', '/compose');
    expect(screen.getByRole('link', { name: /Photo & Media/i })).toHaveAttribute(
      'href',
      '/compose?media=true',
    );
    expect(screen.getByRole('link', { name: /Direct Message/i })).toHaveAttribute(
      'href',
      '/messages',
    );
    expect(screen.getByRole('link', { name: /Bookmarks/i })).toHaveAttribute('href', '/bookmarks');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    const closeBtn = screen.getByRole('button', { name: 'Close compose menu' });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('calls onClose when clicking a destination link', () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <ComposeFanout isOpen={true} onClose={onClose} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('link', { name: /Write Post/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

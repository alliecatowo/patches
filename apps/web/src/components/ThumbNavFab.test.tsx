import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ThumbNavFab } from './ThumbNavFab.js';

describe('ThumbNavFab', () => {
  it('toggles radial menu on click and closes on escape', () => {
    render(
      <MemoryRouter>
        <ThumbNavFab unreadCount={3} />
      </MemoryRouter>,
    );

    const button = screen.getByRole('button', { name: 'Open quick menu' });
    expect(button).toBeInTheDocument();
    expect(screen.queryByRole('menu', { name: 'Quick navigation' })).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(screen.getByRole('menu', { name: 'Quick navigation' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /post/i })).toHaveAttribute('href', '/compose');
    expect(screen.getByRole('menuitem', { name: /search/i })).toHaveAttribute('href', '/search');
    expect(screen.getByRole('menuitem', { name: /messages/i })).toHaveAttribute(
      'href',
      '/messages',
    );
    expect(screen.getByRole('menuitem', { name: /notifications/i })).toHaveAttribute(
      'href',
      '/notifications',
    );
    expect(screen.getByRole('menuitem', { name: /home/i })).toHaveAttribute('href', '/');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu', { name: 'Quick navigation' })).not.toBeInTheDocument();
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ThumbNavFab } from './ThumbNavFab.js';
import { setFanStyle } from '../lib/interfacePreferences.js';

describe('ThumbNavFab', () => {
  it('toggles radial menu on click and closes on escape', () => {
    render(
      <MemoryRouter>
        <ThumbNavFab unreadCount={3} />
      </MemoryRouter>,
    );

    const button = screen.getByRole('button', { name: 'Open quick menu' });
    expect(button).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Quick navigation' })).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(screen.getByRole('navigation', { name: 'Quick navigation' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /post/i })).toHaveAttribute('href', '/compose');
    expect(screen.getByRole('link', { name: /search/i })).toHaveAttribute('href', '/search');
    expect(screen.getByRole('link', { name: /messages/i })).toHaveAttribute('href', '/messages');
    expect(screen.getByRole('link', { name: /notifications/i })).toHaveAttribute(
      'href',
      '/notifications',
    );
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /post/i })).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('navigation', { name: 'Quick navigation' })).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('keeps the same six labeled actions when radial fan style is selected', () => {
    setFanStyle('radial');
    render(
      <MemoryRouter>
        <ThumbNavFab />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open quick menu' }));
    expect(screen.getAllByRole('link')).toHaveLength(6);
    expect(screen.getByRole('navigation', { name: 'Quick navigation' })).toHaveAttribute(
      'data-layout',
      'radial',
    );
  });
});

import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ThumbNavFab } from './ThumbNavFab.js';

const EXPECTED_ACTIONS: ReadonlyArray<{ readonly label: string; readonly href: string }> = [
  { label: 'post', href: '/compose' },
  { label: 'search', href: '/search' },
  { label: 'messages', href: '/messages' },
  { label: 'report', href: '/report' },
  { label: 'notifications', href: '/notifications' },
  { label: 'home', href: '/' },
];

function openMenu(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: 'Open quick menu' }));
  return screen.getByRole('navigation', { name: 'Quick navigation' });
}

describe('ThumbNavFab', () => {
  it('toggles the radial menu on click and closes on escape, restoring focus', () => {
    render(
      <MemoryRouter>
        <ThumbNavFab unreadCount={12} />
      </MemoryRouter>,
    );

    const button = screen.getByRole('button', { name: 'Open quick menu' });
    expect(button).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Quick navigation' })).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(screen.getByRole('navigation', { name: 'Quick navigation' })).toBeInTheDocument();
    expect(screen.getByText('9+')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /post/i })).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('navigation', { name: 'Quick navigation' })).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('renders all six actions on the radial layout, report included', () => {
    render(
      <MemoryRouter>
        <ThumbNavFab />
      </MemoryRouter>,
    );

    const nav = openMenu();
    expect(nav).toHaveAttribute('data-layout', 'radial');
    const links = within(nav).getAllByRole('link');
    expect(links).toHaveLength(6);
    for (const action of EXPECTED_ACTIONS) {
      expect(within(nav).getByRole('link', { name: action.label })).toHaveAttribute(
        'href',
        action.href,
      );
    }
  });

  it('stagger items along the arc with strictly increasing animation delays', () => {
    render(
      <MemoryRouter>
        <ThumbNavFab />
      </MemoryRouter>,
    );

    const links = within(openMenu()).getAllByRole('link');
    const delays = links.map((link) => Number.parseFloat(link.style.animationDelay));
    expect(delays.every((delay) => Number.isFinite(delay))).toBe(true);
    for (let index = 1; index < delays.length; index += 1) {
      const previous = delays[index - 1];
      const current = delays[index];
      if (previous === undefined || current === undefined) throw new Error('missing delay');
      expect(current).toBeGreaterThan(previous);
    }
  });

  it('closes on backdrop click', () => {
    render(
      <MemoryRouter>
        <ThumbNavFab />
      </MemoryRouter>,
    );

    const button = screen.getByRole('button', { name: 'Open quick menu' });
    fireEvent.click(button);
    const backdrop = document.querySelector('div[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();
    if (backdrop === null) throw new Error('backdrop missing');
    fireEvent.click(backdrop);
    expect(screen.queryByRole('navigation', { name: 'Quick navigation' })).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });
});

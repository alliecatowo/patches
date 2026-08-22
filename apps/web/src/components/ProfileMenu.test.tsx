import type { Actor } from '@patches/proto/es';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppSession } from '../api/session.js';
import { ProfileMenu } from './ProfileMenu.js';

const mockSignOut = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockUseSession = vi.fn<() => AppSession | null>();

vi.mock('../api/client.js', () => ({
  signOut: (): Promise<void> => mockSignOut(),
}));

vi.mock('../hooks/useSession.js', () => ({
  useSession: () => mockUseSession(),
}));

describe('ProfileMenu', () => {
  beforeEach(() => {
    mockSignOut.mockClear();
    mockUseSession.mockReset();
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <MemoryRouter>
        <ProfileMenu isOpen={false} onClose={vi.fn()} />
      </MemoryRouter>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders guest destinations when not signed in', () => {
    mockUseSession.mockReturnValue(null);
    render(
      <MemoryRouter>
        <ProfileMenu isOpen={true} onClose={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Register' })).toHaveAttribute('href', '/register');
    expect(screen.getByRole('link', { name: 'Moderation Log' })).toHaveAttribute(
      'href',
      '/moderation/log',
    );
  });

  it('renders signed-in profile, settings, bookmarks, messages and handles sign out', () => {
    mockUseSession.mockReturnValue({
      actor: { id: 'actor-1', handle: 'allie', displayName: 'Allie C' } as unknown as Actor,
    });
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <ProfileMenu isOpen={true} onClose={onClose} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /@allie profile/i })).toHaveAttribute(
      'href',
      '/@allie',
    );
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/@allie');
    expect(screen.getByRole('link', { name: 'Bookmarks' })).toHaveAttribute('href', '/bookmarks');
    expect(screen.getByRole('link', { name: 'Messages' })).toHaveAttribute('href', '/messages');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/settings/profile',
    );
    expect(screen.getByRole('link', { name: 'Appeals' })).toHaveAttribute('href', '/appeals');
    expect(screen.getByRole('link', { name: 'Moderation Log' })).toHaveAttribute(
      'href',
      '/moderation/log',
    );

    const signOutBtn = screen.getByRole('button', { name: 'Sign out' });
    fireEvent.click(signOutBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('closes when pressing Escape', () => {
    mockUseSession.mockReturnValue(null);
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <ProfileMenu isOpen={true} onClose={onClose} />
      </MemoryRouter>,
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

import type { Actor } from '@patches/proto/es';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppSession } from '../api/session.js';
import type { SavedAccountSummary } from '../api/accounts.js';
import { ProfileMenu } from './ProfileMenu.js';

const mockLogoutCurrentSession = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockSwitchTo = vi.fn<(userId: string) => Promise<boolean>>().mockResolvedValue(true);
const mockRemove = vi.fn<(userId: string) => void>();
const mockUseSession = vi.fn<() => AppSession | null>();
const mockUseAccounts = vi.fn<() => SavedAccountSummary[]>();

vi.mock('../api/client.js', () => ({
  logoutCurrentSession: (): Promise<void> => mockLogoutCurrentSession(),
  switchToAccount: (userId: string): Promise<boolean> => mockSwitchTo(userId),
  removeAccount: (userId: string): void => mockRemove(userId),
}));

vi.mock('../hooks/useSession.js', () => ({
  useSession: () => mockUseSession(),
}));

vi.mock('../hooks/useAccounts.js', () => ({
  useAccounts: () => mockUseAccounts(),
}));

const session: AppSession = {
  actor: { id: 'actor-1', handle: 'allie', displayName: 'Allie C' } as unknown as Actor,
};

describe('ProfileMenu', () => {
  beforeEach(() => {
    mockLogoutCurrentSession.mockClear();
    mockSwitchTo.mockClear();
    mockRemove.mockClear();
    mockUseSession.mockReset();
    mockUseAccounts.mockReset();
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
    mockUseSession.mockReturnValue(session);
    mockUseAccounts.mockReturnValue([]);
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
    expect(mockLogoutCurrentSession).toHaveBeenCalledTimes(1);
  });

  it('offers an "Add account" link that points at the login screen', () => {
    mockUseSession.mockReturnValue(session);
    mockUseAccounts.mockReturnValue([]);
    render(
      <MemoryRouter>
        <ProfileMenu isOpen={true} onClose={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Add account' })).toHaveAttribute('href', '/login');
  });

  it('does not list the currently signed-in account as switchable', () => {
    mockUseSession.mockReturnValue(session);
    mockUseAccounts.mockReturnValue([
      { userId: 'actor-1', handle: 'allie', displayName: 'Allie C', avatarUrl: undefined },
      { userId: 'actor-2', handle: 'bob', displayName: 'Bob B', avatarUrl: undefined },
    ]);
    render(
      <MemoryRouter>
        <ProfileMenu isOpen={true} onClose={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: /switch to @allie/i })).toBeNull();
    expect(screen.getByRole('button', { name: /switch to @bob/i })).toBeTruthy();
  });

  it('switches to a saved account on click', () => {
    mockUseSession.mockReturnValue(session);
    mockUseAccounts.mockReturnValue([
      { userId: 'actor-2', handle: 'bob', displayName: 'Bob B', avatarUrl: undefined },
    ]);
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <ProfileMenu isOpen={true} onClose={onClose} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /switch to @bob/i }));
    expect(mockSwitchTo).toHaveBeenCalledWith('actor-2');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('removes a saved account without closing the menu', () => {
    mockUseSession.mockReturnValue(session);
    mockUseAccounts.mockReturnValue([
      { userId: 'actor-2', handle: 'bob', displayName: 'Bob B', avatarUrl: undefined },
    ]);
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <ProfileMenu isOpen={true} onClose={onClose} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /remove saved account @bob/i }));
    expect(mockRemove).toHaveBeenCalledWith('actor-2');
    expect(onClose).not.toHaveBeenCalled();
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

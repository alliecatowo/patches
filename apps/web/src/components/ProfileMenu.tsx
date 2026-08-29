import { useQueryClient } from '@tanstack/react-query';
import { useEffect, type JSX } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { logoutCurrentSession, removeAccount, switchToAccount } from '../api/client.js';
import { useAccounts } from '../hooks/useAccounts.js';
import { useSession } from '../hooks/useSession.js';
import {
  BookmarkIcon,
  LogOutIcon,
  MessageIcon,
  PlusIcon,
  ScaleIcon,
  SettingsIcon,
  ShieldIcon,
  TrashIcon,
  UserIcon,
} from './icons/Icons.js';
import styles from './ProfileMenu.module.css';

export interface ProfileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProfileMenu({ isOpen, onClose }: ProfileMenuProps): JSX.Element | null {
  const session = useSession();
  const accounts = useAccounts();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSignOut = (): void => {
    onClose();
    void logoutCurrentSession().then(() => navigate('/'));
  };

  const handleSwitchTo = (userId: string): void => {
    onClose();
    // Route + session reset for the new actor: `switchToAccount` swaps the active credential
    // slot, but most feed/notification query keys aren't actor-scoped, so without clearing
    // the React Query cache the new account briefly renders the previous one's cached server
    // data. `clear()` drops every cached query; the home navigation below then refetches as
    // the freshly-active actor. (Mutable prefs like the E2EE message vault already partition
    // per actor id and re-initialise on their own.)
    queryClient.clear();
    void switchToAccount(userId).then(() => navigate('/'));
  };

  const handleRemoveAccount = (userId: string): void => {
    void removeAccount(userId);
  };

  /** Saved accounts other than the one currently signed in (already excludes the active). */
  const otherAccounts =
    session === null ? [] : accounts.filter((account) => account.userId !== session.actor.id);

  return (
    <div
      className={styles['overlay']}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Account & settings menu"
    >
      <div
        className={styles['menu']}
        onClick={(e) => e.stopPropagation()}
        id="profile-dropdown-menu"
      >
        <div className={styles['handle']} />

        {session ? (
          <Link
            to={`/@${session.actor.handle}`}
            className={styles['userCard']}
            onClick={onClose}
            aria-label={`@${session.actor.handle} profile`}
          >
            {session.actor.avatar?.url ? (
              <img src={session.actor.avatar.url} alt="" className={styles['avatar']} />
            ) : (
              <div className={styles['avatarPlaceholder']}>
                {session.actor.handle.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className={styles['userDetails']}>
              <span className={styles['name']}>
                {session.actor.displayName || session.actor.handle}
              </span>
              <span className={styles['handleText']}>@{session.actor.handle}</span>
              <span className={styles['viewProfilePrompt']}>View profile →</span>
            </div>
          </Link>
        ) : (
          <div className={styles['guestHeader']}>
            <span className={styles['brand']}>patches</span>
            <div className={styles['guestAuthButtons']}>
              <Link to="/login" className={styles['guestSignIn']} onClick={onClose}>
                Sign in
              </Link>
              <Link to="/register" className={styles['guestRegister']} onClick={onClose}>
                Register
              </Link>
            </div>
          </div>
        )}

        <div className={styles['menuList']}>
          {session ? (
            <>
              {otherAccounts.length > 0 ? (
                <>
                  <div className={styles['accountsSection']}>
                    <span className={styles['accountsLabel']}>Switch account</span>
                    {otherAccounts.map((account) => (
                      <div key={account.userId} className={styles['accountRow']}>
                        <button
                          type="button"
                          className={styles['accountButton']}
                          onClick={() => handleSwitchTo(account.userId)}
                          aria-label={`Switch to @${account.handle}`}
                        >
                          <UserIcon size={18} />
                          <span className={styles['accountName']}>
                            {account.displayName || account.handle}
                          </span>
                          <span className={styles['accountHandle']}>@{account.handle}</span>
                        </button>
                        <button
                          type="button"
                          className={styles['accountRemove']}
                          onClick={() => handleRemoveAccount(account.userId)}
                          aria-label={`Remove saved account @${account.handle}`}
                        >
                          <TrashIcon size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className={styles['divider']} />
                </>
              ) : null}

              <Link to="/login" className={styles['menuItem']} onClick={onClose}>
                <PlusIcon size={18} />
                <span>Add account</span>
              </Link>

              <Link
                to={`/@${session.actor.handle}`}
                className={styles['menuItem']}
                onClick={onClose}
              >
                <UserIcon size={18} />
                <span>Profile</span>
              </Link>

              <Link to="/bookmarks" className={styles['menuItem']} onClick={onClose}>
                <BookmarkIcon size={18} />
                <span>Bookmarks</span>
              </Link>

              <Link to="/messages" className={styles['menuItem']} onClick={onClose}>
                <MessageIcon size={18} />
                <span>Messages</span>
              </Link>

              <Link to="/settings/profile" className={styles['menuItem']} onClick={onClose}>
                <SettingsIcon size={18} />
                <span>Settings</span>
              </Link>

              <Link to="/appeals" className={styles['menuItem']} onClick={onClose}>
                <ScaleIcon size={18} />
                <span>Appeals</span>
              </Link>
            </>
          ) : null}

          <Link to="/moderation/log" className={styles['menuItem']} onClick={onClose}>
            <ShieldIcon size={18} />
            <span>Moderation Log</span>
          </Link>

          {session ? (
            <>
              <div className={styles['divider']} />
              <button
                type="button"
                className={`${styles['menuItem']} ${styles['signOutItem']}`}
                onClick={handleSignOut}
              >
                <LogOutIcon size={18} />
                <span>Sign out</span>
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

import { useEffect, type JSX } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { logoutCurrentSession } from '../api/client.js';
import { useSession } from '../hooks/useSession.js';
import {
  BookmarkIcon,
  LogOutIcon,
  MessageIcon,
  ScaleIcon,
  SettingsIcon,
  ShieldIcon,
  UserIcon,
} from './icons/Icons.js';
import styles from './ProfileMenu.module.css';

export interface ProfileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProfileMenu({ isOpen, onClose }: ProfileMenuProps): JSX.Element | null {
  const session = useSession();
  const navigate = useNavigate();

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

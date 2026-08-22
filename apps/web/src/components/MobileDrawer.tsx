import { useEffect, type JSX } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { signOut } from '../api/client.js';
import { useSession } from '../hooks/useSession.js';
import { useTheme } from '../hooks/useTheme.js';
import { THEME_CATALOG } from '../lib/theme.js';
import { usePwaInstall } from '../pwa/usePwaInstall.js';
import {
  BookmarkIcon,
  CloseIcon,
  DownloadIcon,
  LogOutIcon,
  MessageIcon,
  ScaleIcon,
  SettingsIcon,
  ShieldIcon,
  SparklesIcon,
  UserIcon,
} from './icons/Icons.js';
import styles from './MobileDrawer.module.css';

export interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileDrawer({ isOpen, onClose }: MobileDrawerProps): JSX.Element | null {
  const session = useSession();
  const navigate = useNavigate();
  const { preference, setPreference } = useTheme();
  const { isInstallable, isStandalone, isIos, promptInstall } = usePwaInstall();

  // Close drawer on Escape key and prevent background scroll when open
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
    void signOut().then(() => navigate('/'));
  };

  const handleInstallClick = async (): Promise<void> => {
    if (isInstallable) {
      const accepted = await promptInstall();
      if (accepted) onClose();
    }
  };

  return (
    <div className={styles['overlay']} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles['drawer']} onClick={(e) => e.stopPropagation()}>
        <div className={styles['handle']} />

        <div className={styles['header']}>
          {session ? (
            <Link
              to={`/@${session.actor.handle}`}
              className={styles['userProfile']}
              onClick={onClose}
            >
              {session.actor.avatar?.url ? (
                <img src={session.actor.avatar.url} alt="" className={styles['avatar']} />
              ) : (
                <div className={styles['avatarPlaceholder']}>
                  {session.actor.handle.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className={styles['userInfo']}>
                <span className={styles['displayName']}>
                  {session.actor.displayName || session.actor.handle}
                </span>
                <span className={styles['handleText']}>@{session.actor.handle}</span>
              </div>
            </Link>
          ) : (
            <div className={styles['guestHeader']}>
              <span className={styles['brand']}>patches</span>
              <div className={styles['authLinks']}>
                <Link to="/login" className={styles['primaryAuth']} onClick={onClose}>
                  Sign in
                </Link>
                <Link to="/register" className={styles['secondaryAuth']} onClick={onClose}>
                  Register
                </Link>
              </div>
            </div>
          )}

          <button
            type="button"
            className={styles['closeButton']}
            onClick={onClose}
            aria-label="Close menu"
          >
            <CloseIcon size={20} />
          </button>
        </div>

        {/* PWA Install Banner */}
        {!isStandalone && (isInstallable || isIos) ? (
          <div className={styles['installCard']}>
            <div className={styles['installInfo']}>
              <DownloadIcon size={20} className={styles['installIcon']} />
              <div>
                <strong>Install Patches</strong>
                <p>Add to home screen for the full app experience.</p>
              </div>
            </div>
            {isInstallable ? (
              <button
                type="button"
                className={styles['installButton']}
                onClick={() => void handleInstallClick()}
              >
                Install
              </button>
            ) : isIos ? (
              <span className={styles['iosHint']}>Tap Share ⎋ → Add to Home Screen</span>
            ) : null}
          </div>
        ) : null}

        {/* Navigation items */}
        <div className={styles['navSection']}>
          {session ? (
            <>
              <Link
                to={`/@${session.actor.handle}`}
                className={styles['navItem']}
                onClick={onClose}
              >
                <UserIcon size={18} />
                <span>Profile</span>
              </Link>
              <Link to="/bookmarks" className={styles['navItem']} onClick={onClose}>
                <BookmarkIcon size={18} />
                <span>Bookmarks</span>
              </Link>
              <Link to="/messages" className={styles['navItem']} onClick={onClose}>
                <MessageIcon size={18} />
                <span>Messages</span>
              </Link>
            </>
          ) : null}

          <Link to="/moderation/log" className={styles['navItem']} onClick={onClose}>
            <ShieldIcon size={18} />
            <span>Moderation Log</span>
          </Link>

          {session ? (
            <>
              <Link to="/appeals" className={styles['navItem']} onClick={onClose}>
                <ScaleIcon size={18} />
                <span>Appeals</span>
              </Link>
              <Link to="/settings/profile" className={styles['navItem']} onClick={onClose}>
                <SettingsIcon size={18} />
                <span>Settings</span>
              </Link>
            </>
          ) : null}
        </div>

        {/* Theme quick picker */}
        <div className={styles['themeSection']}>
          <div className={styles['themeSectionHeader']}>
            <SparklesIcon size={16} />
            <span>Appearance & Theme</span>
          </div>
          <div className={styles['themePills']}>
            {THEME_CATALOG.map((theme) => (
              <button
                key={theme.id}
                type="button"
                className={`${styles['themePill']} ${preference === theme.id ? styles['themePillActive'] : ''}`}
                style={{
                  backgroundColor: theme.preview.bg,
                  color: theme.preview.fg,
                  borderColor: theme.preview.border,
                }}
                onClick={() => setPreference(theme.id)}
              >
                <span
                  className={styles['swatchDot']}
                  style={{ backgroundColor: theme.preview.accent }}
                />
                {theme.name}
              </button>
            ))}
          </div>
        </div>

        {session ? (
          <div className={styles['footerSection']}>
            <button type="button" className={styles['signOutButton']} onClick={handleSignOut}>
              <LogOutIcon size={18} />
              <span>Sign out</span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

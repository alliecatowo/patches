import { useQuery } from '@tanstack/react-query';
import { useShakeToReport } from '../hooks/useShakeToReport.js';

import { useRef, useState, type JSX } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';

import { api, signOut } from '../api/client.js';
import { HeaderBar } from '../components/HeaderBar.js';
import {
  BellIcon,
  BookmarkIcon,
  ComposeIcon,
  HomeIcon,
  MessageIcon,
  ScaleIcon,
  SearchIcon,
  SettingsIcon,
  ShieldIcon,
  UserIcon,
} from '../components/icons/Icons.js';
import { OfflineBanner } from '../components/OfflineBanner.js';
import { PrivacyNoticeBanner } from '../components/PrivacyNoticeBanner.js';
import { ProfileMenu } from '../components/ProfileMenu.js';
import { ThumbNavFab } from '../components/ThumbNavFab.js';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts.js';
import { useSession } from '../hooks/useSession.js';
import { useAppBadge } from '../pwa/useAppBadge.js';
import styles from './RootLayout.module.css';

const NAV_LINK_CLASS = ({ isActive }: { isActive: boolean }): string =>
  isActive ? `${styles['navLink']} ${styles['active']}` : (styles['navLink'] ?? '');

export function RootLayout(): JSX.Element {
  useShakeToReport();
  const session = useSession();
  const navigate = useNavigate();
  const helpRef = useRef<HTMLDialogElement>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const unreadQuery = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => api.notifications.getUnreadCount({}),
    enabled: session !== null,
    refetchInterval: 30_000,
  });

  const unreadCount = unreadQuery.data?.count ?? 0;

  // Sync unread notification count with PWA App Badging API
  useAppBadge(session ? unreadCount : 0);

  useKeyboardShortcuts({
    c: () => void navigate('/compose'),
    '/': () => void navigate('/search'),
    '?': () => (helpRef.current?.open ? helpRef.current.close() : helpRef.current?.showModal()),
  });

  return (
    <div className={styles['shell']}>
      <OfflineBanner />
      <HeaderBar onOpenProfileMenu={() => setProfileMenuOpen(true)} />

      {/* Desktop Left Sidebar (Terminal Minimalist) */}
      <nav className={styles['nav']} aria-label="Primary">
        <div className={styles['brandRow']}>
          <Link to="/" className={styles['brand']}>
            patches
          </Link>
        </div>

        <div className={styles['navGroup']}>
          <NavLink to="/" end className={NAV_LINK_CLASS}>
            <HomeIcon className={styles['navIcon']} />
            <span className={styles['navLabel']}>Home</span>
          </NavLink>

          <NavLink to="/search" className={NAV_LINK_CLASS}>
            <SearchIcon className={styles['navIcon']} />
            <span className={styles['navLabel']}>Search</span>
          </NavLink>

          <NavLink to="/compose" className={NAV_LINK_CLASS}>
            <ComposeIcon className={styles['navIcon']} />
            <span className={styles['navLabel']}>Compose</span>
          </NavLink>

          <NavLink
            to="/notifications"
            className={NAV_LINK_CLASS}
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          >
            <div className={styles['iconBadgeWrap']}>
              <BellIcon className={styles['navIcon']} />
              {unreadCount > 0 ? (
                <span className={styles['unreadBadge']} aria-hidden="true">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ) : null}
            </div>
            <span className={styles['navLabel']}>Notifications</span>
          </NavLink>

          {session ? (
            <>
              <NavLink to="/messages" className={NAV_LINK_CLASS}>
                <MessageIcon className={styles['navIcon']} />
                <span className={styles['navLabel']}>Messages</span>
              </NavLink>

              <NavLink to="/bookmarks" className={NAV_LINK_CLASS}>
                <BookmarkIcon className={styles['navIcon']} />
                <span className={styles['navLabel']}>Bookmarks</span>
              </NavLink>

              <NavLink to="/settings/profile" className={NAV_LINK_CLASS}>
                <SettingsIcon className={styles['navIcon']} />
                <span className={styles['navLabel']}>Settings</span>
              </NavLink>

              <NavLink to="/appeals" className={NAV_LINK_CLASS}>
                <ScaleIcon className={styles['navIcon']} />
                <span className={styles['navLabel']}>Appeals</span>
              </NavLink>
            </>
          ) : null}

          <NavLink to="/moderation/log" className={NAV_LINK_CLASS}>
            <ShieldIcon className={styles['navIcon']} />
            <span className={styles['navLabel']}>Mod log</span>
          </NavLink>
        </div>

        {/* Desktop Primary Compose Button */}
        <Link to="/compose" className={styles['desktopComposeButton']}>
          <ComposeIcon size={18} />
          <span>New Post</span>
        </Link>

        {/* Desktop Sidebar Bottom User Card */}
        <div className={styles['bottomNavArea']}>
          {session ? (
            <button
              type="button"
              className={styles['userCardButton']}
              onClick={() => setProfileMenuOpen((open) => !open)}
              aria-label="More"
              aria-expanded={profileMenuOpen}
              aria-controls="profile-dropdown-menu"
            >
              {session.actor.avatar?.url ? (
                <img src={session.actor.avatar.url} alt="" className={styles['sidebarAvatar']} />
              ) : (
                <div className={styles['sidebarAvatarPlaceholder']}>
                  {session.actor.handle.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className={styles['userCardDetails']}>
                <span className={styles['userCardName']}>
                  {session.actor.displayName || session.actor.handle}
                </span>
                <span className={styles['userCardHandle']}>@{session.actor.handle}</span>
              </div>
            </button>
          ) : (
            <div className={styles['guestSidebarLinks']}>
              <NavLink to="/login" className={NAV_LINK_CLASS}>
                <UserIcon className={styles['navIcon']} />
                <span className={styles['navLabel']}>Sign in</span>
              </NavLink>
              <NavLink to="/register" className={NAV_LINK_CLASS}>
                <span className={styles['navLabel']}>Register</span>
              </NavLink>
              <button
                type="button"
                className={styles['moreHiddenTrigger']}
                onClick={() => setProfileMenuOpen((open) => !open)}
                aria-label="More"
                aria-expanded={profileMenuOpen}
              >
                More
              </button>
            </div>
          )}
        </div>

        {/* Accessible destinations block for screen readers */}
        {profileMenuOpen ? (
          <div
            id="mobile-more-menu"
            className={styles['moreMenuFallback']}
            role="group"
            aria-label="More destinations"
          >
            <NavLink
              to="/moderation/log"
              className={NAV_LINK_CLASS}
              onClick={() => setProfileMenuOpen(false)}
            >
              Mod log
            </NavLink>
            {session ? (
              <>
                <NavLink
                  to="/bookmarks"
                  className={NAV_LINK_CLASS}
                  onClick={() => setProfileMenuOpen(false)}
                >
                  Bookmarks
                </NavLink>
                <NavLink
                  to="/messages"
                  className={NAV_LINK_CLASS}
                  onClick={() => setProfileMenuOpen(false)}
                >
                  Messages
                </NavLink>
                <NavLink
                  to={`/@${session.actor.handle}`}
                  className={NAV_LINK_CLASS}
                  onClick={() => setProfileMenuOpen(false)}
                >
                  Profile
                </NavLink>
                <NavLink
                  to="/settings/profile"
                  className={NAV_LINK_CLASS}
                  onClick={() => setProfileMenuOpen(false)}
                >
                  Settings
                </NavLink>
                <NavLink
                  to="/appeals"
                  className={NAV_LINK_CLASS}
                  onClick={() => setProfileMenuOpen(false)}
                >
                  Appeals
                </NavLink>
                <button
                  type="button"
                  className={styles['navLink']}
                  onClick={() => {
                    setProfileMenuOpen(false);
                    void signOut().then(() => navigate('/'));
                  }}
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <NavLink
                  to="/login"
                  className={NAV_LINK_CLASS}
                  onClick={() => setProfileMenuOpen(false)}
                >
                  Sign in
                </NavLink>
                <NavLink
                  to="/register"
                  className={NAV_LINK_CLASS}
                  onClick={() => setProfileMenuOpen(false)}
                >
                  Register
                </NavLink>
              </>
            )}
          </div>
        ) : null}
      </nav>

      {/* Floating Right-Thumb Radial Fan-Out FAB (Mobile) */}
      <ThumbNavFab unreadCount={unreadCount} />

      {/* Sleek Terminal-Style Profile Dropdown & Sheet */}
      <ProfileMenu isOpen={profileMenuOpen} onClose={() => setProfileMenuOpen(false)} />

      <main className={styles['main']}>
        <PrivacyNoticeBanner />
        <Outlet />
      </main>

      <footer className={styles['footer']}>
        <small>
          patches web{' '}
          <code title={`built ${__PATCHES_WEB_BUILT_AT__}`}>{__PATCHES_WEB_VERSION__}</code>
          {' · '}
          <a
            href="https://github.com/alliecatowo/patches"
            target="_blank"
            rel="noopener noreferrer"
          >
            source
          </a>
          {' · '}
          <a href="https://patches-site.pages.dev" target="_blank" rel="noopener noreferrer">
            docs
          </a>
        </small>
      </footer>

      <dialog
        ref={helpRef}
        className={styles['helpDialog']}
        aria-labelledby="keyboard-shortcuts-title"
      >
        <h2 id="keyboard-shortcuts-title">Keyboard shortcuts</h2>
        <p>
          <kbd className={styles['helpKbd']}>j</kbd>/<kbd className={styles['helpKbd']}>k</kbd> move
          between posts
        </p>
        <p>
          <kbd className={styles['helpKbd']}>l</kbd> like focused post
        </p>
        <p>
          <kbd className={styles['helpKbd']}>c</kbd> compose new post
        </p>
        <p>
          <kbd className={styles['helpKbd']}>/</kbd> search
        </p>
        <p>
          <kbd className={styles['helpKbd']}>?</kbd> toggle help
        </p>
        <form method="dialog" style={{ marginTop: '1rem' }}>
          <button
            type="submit"
            style={{
              padding: '0.4rem 0.8rem',
              borderRadius: 'var(--radius)',
              background: 'var(--bg-raised)',
              border: '1px solid var(--border)',
            }}
          >
            Close
          </button>
        </form>
      </dialog>
    </div>
  );
}

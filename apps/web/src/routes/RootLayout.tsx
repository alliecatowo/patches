import { useQuery } from '@tanstack/react-query';
import { useRef, useState, type JSX } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { api, signOut } from '../api/client.js';
import { HeaderBar } from '../components/HeaderBar.js';
import {
  BellIcon,
  BookmarkIcon,
  ComposeIcon,
  HomeIcon,
  LogOutIcon,
  MenuIcon,
  MessageIcon,
  ScaleIcon,
  SearchIcon,
  SettingsIcon,
  ShieldIcon,
  UserIcon,
} from '../components/icons/Icons.js';
import { MobileDrawer } from '../components/MobileDrawer.js';
import { OfflineBanner } from '../components/OfflineBanner.js';
import { PrivacyNoticeBanner } from '../components/PrivacyNoticeBanner.js';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts.js';
import { useSession } from '../hooks/useSession.js';
import { useAppBadge } from '../pwa/useAppBadge.js';
import styles from './RootLayout.module.css';

const NAV_LINK_CLASS = ({ isActive }: { isActive: boolean }): string =>
  isActive ? `${styles['navLink']} ${styles['active']}` : (styles['navLink'] ?? '');

export function RootLayout(): JSX.Element {
  const session = useSession();
  const navigate = useNavigate();
  const helpRef = useRef<HTMLDialogElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

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
      <HeaderBar />

      <nav className={styles['nav']} aria-label="Primary">
        <div className={styles['brandRow']}>
          <span className={styles['brand']}>patches</span>
        </div>

        <NavLink
          to="/"
          end
          className={({ isActive }) => `${NAV_LINK_CLASS({ isActive })} ${styles['homeLink']}`}
        >
          <HomeIcon className={styles['navIcon']} />
          <span className={styles['navLabel']}>Home</span>
        </NavLink>

        <NavLink
          to="/search"
          className={({ isActive }) => `${NAV_LINK_CLASS({ isActive })} ${styles['searchLink']}`}
        >
          <SearchIcon className={styles['navIcon']} />
          <span className={styles['navLabel']}>Search</span>
        </NavLink>

        <NavLink
          to="/compose"
          className={({ isActive }) =>
            `${NAV_LINK_CLASS({ isActive })} ${styles['composeLink']} ${styles['composeMobileAction']}`
          }
        >
          <div className={styles['composeMobileCircle']}>
            <ComposeIcon className={styles['navIcon']} />
          </div>
          <span className={styles['navLabel']}>Compose</span>
        </NavLink>

        <NavLink
          to="/notifications"
          className={({ isActive }) =>
            `${NAV_LINK_CLASS({ isActive })} ${styles['notificationsLink']}`
          }
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

        <NavLink
          to="/moderation/log"
          className={({ isActive }) => `${NAV_LINK_CLASS({ isActive })} ${styles['desktopOnly']}`}
        >
          <ShieldIcon className={styles['navIcon']} />
          <span className={styles['navLabel']}>Mod log</span>
        </NavLink>

        {session ? (
          <>
            <NavLink
              to="/appeals"
              className={({ isActive }) =>
                `${NAV_LINK_CLASS({ isActive })} ${styles['desktopOnly']}`
              }
            >
              <ScaleIcon className={styles['navIcon']} />
              <span className={styles['navLabel']}>Appeals</span>
            </NavLink>
            <NavLink
              to="/bookmarks"
              className={({ isActive }) =>
                `${NAV_LINK_CLASS({ isActive })} ${styles['desktopOnly']}`
              }
            >
              <BookmarkIcon className={styles['navIcon']} />
              <span className={styles['navLabel']}>Bookmarks</span>
            </NavLink>
            <NavLink
              to="/messages"
              className={({ isActive }) =>
                `${NAV_LINK_CLASS({ isActive })} ${styles['desktopOnly']}`
              }
            >
              <MessageIcon className={styles['navIcon']} />
              <span className={styles['navLabel']}>Messages</span>
            </NavLink>
            <NavLink
              to={`/@${session.actor.handle}`}
              className={({ isActive }) =>
                `${NAV_LINK_CLASS({ isActive })} ${styles['desktopOnly']}`
              }
            >
              <UserIcon className={styles['navIcon']} />
              <span className={styles['navLabel']}>@{session.actor.handle}</span>
            </NavLink>
            <NavLink
              to="/settings/profile"
              className={({ isActive }) =>
                `${NAV_LINK_CLASS({ isActive })} ${styles['desktopOnly']}`
              }
            >
              <SettingsIcon className={styles['navIcon']} />
              <span className={styles['navLabel']}>Settings</span>
            </NavLink>
            <button
              type="button"
              className={`${styles['navLink']} ${styles['desktopOnly']}`}
              onClick={() => {
                void signOut().then(() => navigate('/'));
              }}
            >
              <LogOutIcon className={styles['navIcon']} />
              <span className={styles['navLabel']}>Sign out</span>
            </button>
          </>
        ) : (
          <>
            <NavLink
              to="/login"
              className={({ isActive }) =>
                `${NAV_LINK_CLASS({ isActive })} ${styles['desktopOnly']}`
              }
            >
              <UserIcon className={styles['navIcon']} />
              <span className={styles['navLabel']}>Sign in</span>
            </NavLink>
            <NavLink
              to="/register"
              className={({ isActive }) =>
                `${NAV_LINK_CLASS({ isActive })} ${styles['desktopOnly']}`
              }
            >
              <span className={styles['navLabel']}>Register</span>
            </NavLink>
          </>
        )}

        <div className={styles['more']}>
          <button
            type="button"
            className={styles['moreButton']}
            aria-expanded={drawerOpen}
            aria-controls="mobile-more-menu"
            aria-label="More"
            onClick={() => setDrawerOpen((open) => !open)}
          >
            <MenuIcon className={styles['navIcon']} />
            <span className={styles['navLabel']}>More</span>
          </button>
          {drawerOpen ? (
            <div
              id="mobile-more-menu"
              className={styles['moreMenuFallback']}
              role="group"
              aria-label="More destinations"
            >
              <NavLink
                to="/moderation/log"
                className={NAV_LINK_CLASS}
                onClick={() => setDrawerOpen(false)}
              >
                Mod log
              </NavLink>
              {session ? (
                <>
                  <NavLink
                    to="/bookmarks"
                    className={NAV_LINK_CLASS}
                    onClick={() => setDrawerOpen(false)}
                  >
                    Bookmarks
                  </NavLink>
                  <NavLink
                    to="/messages"
                    className={NAV_LINK_CLASS}
                    onClick={() => setDrawerOpen(false)}
                  >
                    Messages
                  </NavLink>
                  <NavLink
                    to={`/@${session.actor.handle}`}
                    className={NAV_LINK_CLASS}
                    onClick={() => setDrawerOpen(false)}
                  >
                    Profile
                  </NavLink>
                  <NavLink
                    to="/settings/profile"
                    className={NAV_LINK_CLASS}
                    onClick={() => setDrawerOpen(false)}
                  >
                    Settings
                  </NavLink>
                  <NavLink
                    to="/appeals"
                    className={NAV_LINK_CLASS}
                    onClick={() => setDrawerOpen(false)}
                  >
                    Appeals
                  </NavLink>
                  <button
                    type="button"
                    className={styles['navLink']}
                    onClick={() => {
                      setDrawerOpen(false);
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
                    onClick={() => setDrawerOpen(false)}
                  >
                    Sign in
                  </NavLink>
                  <NavLink
                    to="/register"
                    className={NAV_LINK_CLASS}
                    onClick={() => setDrawerOpen(false)}
                  >
                    Register
                  </NavLink>
                </>
              )}
            </div>
          ) : null}
        </div>
      </nav>

      <MobileDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />

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

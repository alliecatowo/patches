import { useQuery } from '@tanstack/react-query';
import { useRef, useState, type JSX } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { api, signOut } from '../api/client.js';
import { PrivacyNoticeBanner } from '../components/PrivacyNoticeBanner.js';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts.js';
import { useSession } from '../hooks/useSession.js';
import styles from './RootLayout.module.css';

const NAV_LINK_CLASS = ({ isActive }: { isActive: boolean }): string =>
  isActive ? `${styles['navLink']} ${styles['active']}` : (styles['navLink'] ?? '');

export function RootLayout(): JSX.Element {
  const session = useSession();
  const navigate = useNavigate();
  const helpRef = useRef<HTMLDialogElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const unreadQuery = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => api.notifications.getUnreadCount({}),
    enabled: session !== null,
    refetchInterval: 30_000,
  });

  useKeyboardShortcuts({
    c: () => void navigate('/compose'),
    '/': () => void navigate('/search'),
    '?': () => (helpRef.current?.open ? helpRef.current.close() : helpRef.current?.showModal()),
  });

  return (
    <div className={styles['shell']}>
      <nav className={styles['nav']} aria-label="Primary">
        <span className={styles['brand']}>patches</span>
        <NavLink
          to="/"
          end
          className={({ isActive }) => `${NAV_LINK_CLASS({ isActive })} ${styles['homeLink']}`}
        >
          <span className={styles['navLabel']}>Home</span>
        </NavLink>
        <NavLink
          to="/search"
          className={({ isActive }) => `${NAV_LINK_CLASS({ isActive })} ${styles['searchLink']}`}
        >
          <span className={styles['navLabel']}>Search</span>
        </NavLink>
        <NavLink
          to="/compose"
          className={({ isActive }) => `${NAV_LINK_CLASS({ isActive })} ${styles['composeLink']}`}
        >
          <span className={styles['navLabel']}>Compose</span>
        </NavLink>
        <NavLink
          to="/notifications"
          className={({ isActive }) =>
            `${NAV_LINK_CLASS({ isActive })} ${styles['notificationsLink']}`
          }
          aria-label={
            unreadQuery.data && unreadQuery.data.count > 0
              ? `Notifications, ${unreadQuery.data.count} unread`
              : 'Notifications'
          }
        >
          <span className={styles['navLabel']}>Notifications</span>
          {unreadQuery.data && unreadQuery.data.count > 0 ? (
            <span className={styles['unreadBadge']} aria-hidden="true">
              {unreadQuery.data.count}
            </span>
          ) : null}
        </NavLink>
        <NavLink
          to="/moderation/log"
          className={({ isActive }) => `${NAV_LINK_CLASS({ isActive })} ${styles['desktopOnly']}`}
        >
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
              <span className={styles['navLabel']}>Appeals</span>
            </NavLink>
            <NavLink
              to="/bookmarks"
              className={({ isActive }) =>
                `${NAV_LINK_CLASS({ isActive })} ${styles['desktopOnly']}`
              }
            >
              <span className={styles['navLabel']}>Bookmarks</span>
            </NavLink>
            <NavLink
              to="/messages"
              className={({ isActive }) =>
                `${NAV_LINK_CLASS({ isActive })} ${styles['desktopOnly']}`
              }
            >
              <span className={styles['navLabel']}>Messages</span>
            </NavLink>
            <NavLink
              to={`/@${session.actor.handle}`}
              className={({ isActive }) =>
                `${NAV_LINK_CLASS({ isActive })} ${styles['desktopOnly']}`
              }
            >
              <span className={styles['navLabel']}>@{session.actor.handle}</span>
            </NavLink>
            <NavLink
              to="/settings/profile"
              className={({ isActive }) =>
                `${NAV_LINK_CLASS({ isActive })} ${styles['desktopOnly']}`
              }
            >
              <span className={styles['navLabel']}>Settings</span>
            </NavLink>
            <button
              type="button"
              className={`${styles['navLink']} ${styles['desktopOnly']}`}
              onClick={() => {
                void signOut().then(() => navigate('/'));
              }}
            >
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
            aria-expanded={moreOpen}
            aria-controls="mobile-more-menu"
            onClick={() => setMoreOpen((open) => !open)}
          >
            More
          </button>
          {moreOpen ? (
            <div
              id="mobile-more-menu"
              className={styles['moreMenu']}
              role="group"
              aria-label="More destinations"
            >
              <NavLink
                to="/moderation/log"
                className={NAV_LINK_CLASS}
                onClick={() => setMoreOpen(false)}
              >
                Mod log
              </NavLink>
              {session ? (
                <>
                  <NavLink
                    to="/bookmarks"
                    className={NAV_LINK_CLASS}
                    onClick={() => setMoreOpen(false)}
                  >
                    Bookmarks
                  </NavLink>
                  <NavLink
                    to="/messages"
                    className={NAV_LINK_CLASS}
                    onClick={() => setMoreOpen(false)}
                  >
                    Messages
                  </NavLink>
                  <NavLink
                    to={`/@${session.actor.handle}`}
                    className={NAV_LINK_CLASS}
                    onClick={() => setMoreOpen(false)}
                  >
                    Profile
                  </NavLink>
                  <NavLink
                    to="/settings/profile"
                    className={NAV_LINK_CLASS}
                    onClick={() => setMoreOpen(false)}
                  >
                    Settings
                  </NavLink>
                  <NavLink
                    to="/appeals"
                    className={NAV_LINK_CLASS}
                    onClick={() => setMoreOpen(false)}
                  >
                    Appeals
                  </NavLink>
                  <button
                    type="button"
                    className={styles['navLink']}
                    onClick={() => {
                      setMoreOpen(false);
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
                    onClick={() => setMoreOpen(false)}
                  >
                    Sign in
                  </NavLink>
                  <NavLink
                    to="/register"
                    className={NAV_LINK_CLASS}
                    onClick={() => setMoreOpen(false)}
                  >
                    Register
                  </NavLink>
                </>
              )}
            </div>
          ) : null}
        </div>
      </nav>
      <main className={styles['main']}>
        <PrivacyNoticeBanner />
        <Outlet />
      </main>
      <footer className={styles['footer']}>
        <small>
          patches web{' '}
          <code title={`built ${__PATCHES_WEB_BUILT_AT__}`}>{__PATCHES_WEB_VERSION__}</code>
          {' · '}
          <a href="https://github.com/alliecatowo/patches">source</a>
          {' · '}
          <a href="https://patches-site.pages.dev">docs</a>
        </small>
      </footer>
      <dialog ref={helpRef} className={styles['helpDialog']}>
        <h2>Keyboard shortcuts</h2>
        <p>
          <kbd className={styles['helpKbd']}>j</kbd>/<kbd className={styles['helpKbd']}>k</kbd> move
          between posts
        </p>
        <p>
          <kbd className={styles['helpKbd']}>l</kbd> like the focused post
        </p>
        <p>
          <kbd className={styles['helpKbd']}>c</kbd> compose
        </p>
        <p>
          <kbd className={styles['helpKbd']}>/</kbd> search
        </p>
        <p>
          <kbd className={styles['helpKbd']}>?</kbd> toggle this help
        </p>
        <form method="dialog">
          <button type="submit">Close</button>
        </form>
      </dialog>
    </div>
  );
}

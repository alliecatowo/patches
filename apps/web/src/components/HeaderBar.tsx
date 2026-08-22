import type { JSX } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useSession } from '../hooks/useSession.js';
import { ChevronLeftIcon } from './icons/Icons.js';
import styles from './HeaderBar.module.css';

function getHeaderTitle(pathname: string): { title: string; showBack: boolean } {
  if (pathname === '/') return { title: 'patches', showBack: false };
  if (pathname === '/search') return { title: 'Search', showBack: false };
  if (pathname === '/compose') return { title: 'Compose', showBack: true };
  if (pathname === '/notifications') return { title: 'Notifications', showBack: false };
  if (pathname === '/bookmarks') return { title: 'Bookmarks', showBack: true };
  if (pathname === '/messages') return { title: 'Messages', showBack: false };
  if (pathname.startsWith('/messages/')) return { title: 'Conversation', showBack: true };
  if (pathname.startsWith('/p/')) return { title: 'Thread', showBack: true };
  if (pathname.startsWith('/@')) return { title: pathname.slice(1), showBack: true };
  if (pathname.startsWith('/t/')) return { title: `#${pathname.slice(3)}`, showBack: true };
  if (pathname.startsWith('/c/')) return { title: 'Community', showBack: true };
  if (pathname.startsWith('/settings')) return { title: 'Settings', showBack: true };
  if (pathname === '/moderation/log') return { title: 'Mod Log', showBack: true };
  if (pathname === '/appeals') return { title: 'Appeals', showBack: true };
  if (pathname === '/login') return { title: 'Sign In', showBack: true };
  if (pathname === '/register') return { title: 'Register', showBack: true };
  return { title: 'patches', showBack: false };
}

export interface HeaderBarProps {
  onOpenProfileMenu?: () => void;
}

export function HeaderBar({ onOpenProfileMenu }: HeaderBarProps = {}): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const session = useSession();

  const { title, showBack } = getHeaderTitle(location.pathname);

  return (
    <header className={styles['headerBar']}>
      <div className={styles['left']}>
        {showBack ? (
          <button
            type="button"
            className={styles['backButton']}
            onClick={() => navigate(-1)}
            aria-label="Go back"
          >
            <ChevronLeftIcon size={22} />
          </button>
        ) : (
          <Link to="/" className={styles['brand']}>
            patches
          </Link>
        )}
      </div>

      <div className={styles['center']}>
        <span className={styles['title']}>{showBack ? title : ''}</span>
      </div>

      <div className={styles['right']}>
        {session ? (
          onOpenProfileMenu ? (
            <button
              type="button"
              className={styles['avatarButton']}
              onClick={onOpenProfileMenu}
              aria-label="Account menu"
            >
              {session.actor.avatar?.url ? (
                <img
                  src={session.actor.avatar.url}
                  alt=""
                  className={styles['avatar']}
                  aria-hidden="true"
                />
              ) : (
                <div className={styles['avatarPlaceholder']}>
                  {session.actor.handle.slice(0, 1).toUpperCase()}
                </div>
              )}
            </button>
          ) : (
            <Link
              to={`/@${session.actor.handle}`}
              className={styles['avatarLink']}
              aria-label={`@${session.actor.handle} profile`}
            >
              {session.actor.avatar?.url ? (
                <img
                  src={session.actor.avatar.url}
                  alt=""
                  className={styles['avatar']}
                  aria-hidden="true"
                />
              ) : (
                <div className={styles['avatarPlaceholder']}>
                  {session.actor.handle.slice(0, 1).toUpperCase()}
                </div>
              )}
            </Link>
          )
        ) : (
          <Link to="/login" className={styles['signInButton']}>
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}

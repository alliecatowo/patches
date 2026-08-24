import { useEffect, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';

import {
  BellIcon,
  ComposeIcon,
  HomeIcon,
  MessageIcon,
  PlusIcon,
  SearchIcon,
  FlagIcon,
} from './icons/Icons.js';
import styles from './ThumbNavFab.module.css';

export interface ThumbNavFabProps {
  unreadCount?: number;
}

export function ThumbNavFab({ unreadCount = 0 }: ThumbNavFabProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <>
      {isOpen ? (
        <div
          className={styles['fabBackdrop']}
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <div className={styles['fabContainer']}>
        {isOpen ? (
          <div className={styles['radialMenu']} role="menu" aria-label="Quick navigation">
            <Link
              to="/compose"
              className={`${styles['radialItem']} ${styles['radialPostItem']}`}
              onClick={() => setIsOpen(false)}
              style={{ animationDelay: '10ms' }}
              role="menuitem"
            >
              <span className={styles['radialLabel']}>post</span>
              <div className={styles['radialIconBtn']}>
                <ComposeIcon size={20} />
              </div>
            </Link>

            <Link
              to="/search"
              className={styles['radialItem']}
              onClick={() => setIsOpen(false)}
              style={{ animationDelay: '40ms' }}
              role="menuitem"
            >
              <span className={styles['radialLabel']}>search</span>
              <div className={styles['radialIconBtn']}>
                <SearchIcon size={19} />
              </div>
            </Link>

            <Link
              to="/messages"
              className={styles['radialItem']}
              onClick={() => setIsOpen(false)}
              style={{ animationDelay: '70ms' }}
              role="menuitem"
            >
              <span className={styles['radialLabel']}>messages</span>
              <div className={styles['radialIconBtn']}>
                <MessageIcon size={19} />
              </div>
            </Link>

            <Link
              to="/report"
              className={`${styles['radialItem']} ${styles['radialReportItem']}`}
              onClick={() => setIsOpen(false)}
              style={{ animationDelay: '115ms' }}
              role="menuitem"
            >
              <span className={styles['radialLabel']}>report</span>
              <div className={styles['radialIconBtn']}>
                <FlagIcon size={19} />
              </div>
            </Link>

            <Link
              to="/notifications"
              className={styles['radialItem']}
              onClick={() => setIsOpen(false)}
              style={{ animationDelay: '100ms' }}
              role="menuitem"
            >
              <span className={styles['radialLabel']}>notifications</span>
              <div className={styles['radialIconBtn']}>
                <BellIcon size={19} />
                {unreadCount > 0 ? (
                  <span className={styles['badge']}>{unreadCount > 9 ? '9+' : unreadCount}</span>
                ) : null}
              </div>
            </Link>

            <Link
              to="/"
              className={styles['radialItem']}
              onClick={() => setIsOpen(false)}
              style={{ animationDelay: '130ms' }}
              role="menuitem"
            >
              <span className={styles['radialLabel']}>home</span>
              <div className={styles['radialIconBtn']}>
                <HomeIcon size={19} />
              </div>
            </Link>
          </div>
        ) : null}

        <button
          type="button"
          className={`${styles['mainFab']} ${isOpen ? styles['open'] : ''}`}
          onClick={() => setIsOpen((prev) => !prev)}
          aria-label={isOpen ? 'Close quick menu' : 'Open quick menu'}
          aria-expanded={isOpen}
        >
          <PlusIcon size={24} strokeWidth={2.5} />
        </button>
      </div>
    </>
  );
}

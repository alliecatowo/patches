import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';

import { useInterfacePreferences } from '../hooks/useInterfacePreferences.js';
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
  const { fanStyle } = useInterfacePreferences();
  const mainButtonRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  const closeAndRestoreFocus = useCallback((): void => {
    mainButtonRef.current?.focus();
    setIsOpen(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeAndRestoreFocus();
    };

    window.addEventListener('keydown', handleKeyDown);
    firstLinkRef.current?.focus();
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeAndRestoreFocus, isOpen]);

  return (
    <>
      {isOpen ? (
        <div className={styles['fabBackdrop']} onClick={closeAndRestoreFocus} aria-hidden="true" />
      ) : null}

      <div className={styles['fabContainer']}>
        {isOpen ? (
          <nav
            className={`${styles['radialMenu']} ${fanStyle === 'radial' ? styles['radialVariant'] : ''}`}
            data-layout={fanStyle}
            aria-label="Quick navigation"
          >
            <Link
              ref={firstLinkRef}
              to="/compose"
              className={`${styles['radialItem']} ${styles['radialPostItem']}`}
              onClick={() => setIsOpen(false)}
              style={{ animationDelay: '10ms' }}
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
            >
              <span className={styles['radialLabel']}>home</span>
              <div className={styles['radialIconBtn']}>
                <HomeIcon size={19} />
              </div>
            </Link>
          </nav>
        ) : null}

        <button
          ref={mainButtonRef}
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

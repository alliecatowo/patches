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

interface QuickAction {
  readonly href: string;
  readonly label: string;
  readonly icon: JSX.Element;
  readonly radialItemClass?: string | undefined;
  readonly stackedItemClass?: string | undefined;
  readonly showBadge?: boolean | undefined;
}

/**
 * The quick-menu actions in a fixed order. Radial slots them on the quarter-circle
 * arc (one --angle per slot in the CSS); stacked lists them vertically from the FAB.
 * DOM order is both the stagger order and the order the e2e geometry asserts.
 */
const QUICK_ACTIONS: readonly QuickAction[] = [
  {
    href: '/compose',
    label: 'post',
    icon: <ComposeIcon size={20} />,
    radialItemClass: styles['radialPostItem'],
    stackedItemClass: styles['stackedPostItem'],
  },
  { href: '/search', label: 'search', icon: <SearchIcon size={19} /> },
  { href: '/messages', label: 'messages', icon: <MessageIcon size={19} /> },
  {
    href: '/report',
    label: 'report',
    icon: <FlagIcon size={19} />,
    radialItemClass: styles['radialReportItem'],
    stackedItemClass: styles['stackedReportItem'],
  },
  { href: '/notifications', label: 'notifications', icon: <BellIcon size={19} />, showBadge: true },
  { href: '/', label: 'home', icon: <HomeIcon size={19} /> },
];

export function ThumbNavFab({ unreadCount = 0 }: ThumbNavFabProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const { fanStyle } = useInterfacePreferences();
  const isRadial = fanStyle === 'radial';
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
            className={isRadial ? styles['radialMenu'] : styles['stackedMenu']}
            data-layout={isRadial ? 'radial' : 'stacked'}
            aria-label="Quick navigation"
          >
            {QUICK_ACTIONS.map((action, index) => {
              const badge =
                action.showBadge && unreadCount > 0 ? (
                  <span className={styles['badge']}>{unreadCount > 9 ? '9+' : unreadCount}</span>
                ) : null;
              return (
                <Link
                  key={action.label}
                  ref={index === 0 ? firstLinkRef : undefined}
                  to={action.href}
                  className={[
                    isRadial ? styles['radialItem'] : styles['stackedItem'],
                    isRadial ? action.radialItemClass : action.stackedItemClass,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setIsOpen(false)}
                  style={{ animationDelay: `${10 + index * 35}ms` }}
                >
                  {isRadial ? (
                    <>
                      <span className={styles['radialLabel']}>{action.label}</span>
                      <div className={styles['radialIconBtn']}>
                        {action.icon}
                        {badge}
                      </div>
                    </>
                  ) : (
                    <>
                      <span className={styles['stackedIconBtn']}>
                        {action.icon}
                        {badge}
                      </span>
                      <span className={styles['stackedLabel']}>{action.label}</span>
                    </>
                  )}
                </Link>
              );
            })}
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

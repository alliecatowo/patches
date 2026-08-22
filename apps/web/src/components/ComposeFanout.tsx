import { useEffect, type JSX } from 'react';
import { Link } from 'react-router-dom';

import { BookmarkIcon, CloseIcon, ComposeIcon, ImageIcon, MessageIcon } from './icons/Icons.js';
import styles from './ComposeFanout.module.css';

export interface ComposeFanoutProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ComposeFanout({ isOpen, onClose }: ComposeFanoutProps): JSX.Element | null {
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

  return (
    <div
      className={styles['overlay']}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Create new"
    >
      <div className={styles['fanoutContent']} onClick={(e) => e.stopPropagation()}>
        <div className={styles['actionRow']}>
          <Link
            to="/compose"
            className={styles['actionButton']}
            onClick={onClose}
            style={{ animationDelay: '20ms' }}
          >
            <div className={styles['actionIconWrap']}>
              <ComposeIcon size={20} />
            </div>
            <div className={styles['actionLabel']}>
              <span className={styles['actionTitle']}>Write Post</span>
              <span className={styles['actionDesc']}>Share text, code, or links</span>
            </div>
          </Link>

          <Link
            to="/compose?media=true"
            className={styles['actionButton']}
            onClick={onClose}
            style={{ animationDelay: '60ms' }}
          >
            <div className={styles['actionIconWrap']}>
              <ImageIcon size={20} />
            </div>
            <div className={styles['actionLabel']}>
              <span className={styles['actionTitle']}>Photo & Media</span>
              <span className={styles['actionDesc']}>Post images with alt text</span>
            </div>
          </Link>

          <Link
            to="/messages"
            className={styles['actionButton']}
            onClick={onClose}
            style={{ animationDelay: '100ms' }}
          >
            <div className={styles['actionIconWrap']}>
              <MessageIcon size={20} />
            </div>
            <div className={styles['actionLabel']}>
              <span className={styles['actionTitle']}>Direct Message</span>
              <span className={styles['actionDesc']}>Send a message to someone</span>
            </div>
          </Link>

          <Link
            to="/bookmarks"
            className={styles['actionButton']}
            onClick={onClose}
            style={{ animationDelay: '140ms' }}
          >
            <div className={styles['actionIconWrap']}>
              <BookmarkIcon size={20} />
            </div>
            <div className={styles['actionLabel']}>
              <span className={styles['actionTitle']}>Bookmarks</span>
              <span className={styles['actionDesc']}>View saved posts</span>
            </div>
          </Link>
        </div>

        <button
          type="button"
          className={styles['closeButton']}
          onClick={onClose}
          aria-label="Close compose menu"
        >
          <CloseIcon size={20} />
        </button>
      </div>
    </div>
  );
}

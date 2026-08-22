import { useCallback, useEffect, useState, type JSX, type TouchEvent } from 'react';

import { ChevronLeftIcon, CloseIcon } from './icons/Icons.js';
import styles from './MediaLightbox.module.css';

export interface LightboxImage {
  mediaId: string;
  url: string;
  altText?: string;
}

export interface MediaLightboxProps {
  images: readonly LightboxImage[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
}

export function MediaLightbox({
  images,
  initialIndex = 0,
  isOpen,
  onClose,
}: MediaLightboxProps): JSX.Element | null {
  const [overrideIndex, setOverrideIndex] = useState<number | null>(null);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const currentIndex = overrideIndex ?? initialIndex;

  const handleClose = useCallback((): void => {
    setOverrideIndex(null);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        handleClose();
      } else if (e.key === 'ArrowLeft') {
        setOverrideIndex((i) => {
          const curr = i ?? initialIndex;
          return curr > 0 ? curr - 1 : images.length - 1;
        });
      } else if (e.key === 'ArrowRight') {
        setOverrideIndex((i) => {
          const curr = i ?? initialIndex;
          return curr < images.length - 1 ? curr + 1 : 0;
        });
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, images.length, initialIndex, handleClose]);

  if (!isOpen || images.length === 0) return null;

  const current = images[currentIndex];
  if (!current) return null;

  const handleTouchStart = (e: TouchEvent<HTMLDivElement>): void => {
    setTouchStartX(e.touches[0]?.clientX ?? null);
  };

  const handleTouchEnd = (e: TouchEvent<HTMLDivElement>): void => {
    if (touchStartX === null) return;
    const touchEndX = e.changedTouches[0]?.clientX ?? null;
    if (touchEndX === null) return;

    const diffX = touchStartX - touchEndX;
    if (Math.abs(diffX) > 40) {
      if (diffX > 0) {
        // Swiped left -> Next
        setOverrideIndex((i) => {
          const curr = i ?? initialIndex;
          return curr < images.length - 1 ? curr + 1 : 0;
        });
      } else {
        // Swiped right -> Prev
        setOverrideIndex((i) => {
          const curr = i ?? initialIndex;
          return curr > 0 ? curr - 1 : images.length - 1;
        });
      }
    }
    setTouchStartX(null);
  };

  return (
    <div
      className={styles['overlay']}
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image lightbox"
    >
      <div className={styles['topBar']} onClick={(e) => e.stopPropagation()}>
        <span className={styles['counter']}>
          {currentIndex + 1} / {images.length}
        </span>
        <button
          type="button"
          className={styles['closeButton']}
          onClick={handleClose}
          aria-label="Close lightbox"
        >
          <CloseIcon size={24} />
        </button>
      </div>

      <div
        className={styles['imageContainer']}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <img src={current.url} alt={current.altText ?? ''} className={styles['image']} />
      </div>

      {images.length > 1 ? (
        <>
          <button
            type="button"
            className={`${styles['navButton']} ${styles['prevButton']}`}
            onClick={(e) => {
              e.stopPropagation();
              setOverrideIndex((i) => {
                const curr = i ?? initialIndex;
                return curr > 0 ? curr - 1 : images.length - 1;
              });
            }}
            aria-label="Previous image"
          >
            <ChevronLeftIcon size={28} />
          </button>
          <button
            type="button"
            className={`${styles['navButton']} ${styles['nextButton']}`}
            onClick={(e) => {
              e.stopPropagation();
              setOverrideIndex((i) => {
                const curr = i ?? initialIndex;
                return curr < images.length - 1 ? curr + 1 : 0;
              });
            }}
            aria-label="Next image"
          >
            <div style={{ transform: 'rotate(180deg)' }}>
              <ChevronLeftIcon size={28} />
            </div>
          </button>
        </>
      ) : null}

      {current.altText ? (
        <div className={styles['caption']} onClick={(e) => e.stopPropagation()}>
          <p>{current.altText}</p>
        </div>
      ) : null}
    </div>
  );
}

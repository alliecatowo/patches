import { useState, type JSX, type ReactNode, type TouchEvent } from 'react';

import styles from './PullToRefresh.module.css';

export interface PullToRefreshProps {
  children: ReactNode;
  onRefresh: () => Promise<unknown> | void;
}

const PULL_THRESHOLD = 60;
const MAX_PULL = 90;

/** Touch-drag-to-refresh for a PWA list (#325). Only engages when the scroll container is
 * already at the top — a mid-scroll downward drag must stay a scroll, never a refresh. */
export function PullToRefresh({ children, onRefresh }: PullToRefreshProps): JSX.Element {
  const [pullY, setPullY] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [startY, setStartY] = useState<number | null>(null);

  const handleTouchStart = (e: TouchEvent<HTMLDivElement>): void => {
    if (window.scrollY <= 0 && document.documentElement.scrollTop <= 0) {
      setStartY(e.touches[0]?.clientY ?? null);
    } else {
      setStartY(null);
    }
  };

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>): void => {
    if (startY === null || isRefreshing) return;
    const currentY = e.touches[0]?.clientY ?? 0;
    const diff = currentY - startY;

    if (diff > 0) {
      // Resistance curve for smooth elastic feel.
      const pull = Math.min(diff * 0.45, MAX_PULL);
      setPullY(pull);
    } else {
      setPullY(0);
    }
  };

  const handleTouchEnd = async (): Promise<void> => {
    if (startY === null) return;
    setStartY(null);

    if (pullY >= PULL_THRESHOLD && !isRefreshing) {
      setIsRefreshing(true);
      setPullY(45);
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(15);
        } catch {
          // Vibration is a nicety, not a requirement — a browser that refuses it changes
          // nothing about the refresh itself.
        }
      }
      try {
        await Promise.resolve(onRefresh());
      } finally {
        setIsRefreshing(false);
        setPullY(0);
      }
    } else {
      setPullY(0);
    }
  };

  return (
    <div
      className={styles['container']}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={() => void handleTouchEnd()}
    >
      {pullY > 0 || isRefreshing ? (
        <div
          className={styles['indicator']}
          style={{ height: `${pullY}px`, opacity: Math.min(pullY / 30, 1) }}
        >
          <div className={`${styles['spinner']} ${isRefreshing ? styles['spin'] : ''}`} />
        </div>
      ) : null}
      {children}
    </div>
  );
}

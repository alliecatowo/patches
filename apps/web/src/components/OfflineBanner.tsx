import { useEffect, useState, type JSX } from 'react';

import { WifiOffIcon } from './icons/Icons.js';
import styles from './OfflineBanner.module.css';

export function OfflineBanner(): JSX.Element | null {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });

  useEffect(() => {
    const handleOnline = (): void => setIsOnline(true);
    const handleOffline = (): void => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className={styles['banner']} role="alert">
      <WifiOffIcon size={16} />
      <span>You are offline — cached content available. Reconnecting…</span>
    </div>
  );
}

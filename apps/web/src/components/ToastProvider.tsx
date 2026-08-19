import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from 'react';

import styles from './ToastProvider.module.css';

export interface Toast {
  id: number;
  title: string;
  message: string;
  tone: 'error' | 'info';
}

interface ToastContextValue {
  pushToast: (toast: Omit<Toast, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (ctx === null) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const pushToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = nextId.current++;
    setToasts((current) => [...current, { ...toast, id }]);
    setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, 6000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ pushToast }}>
      {children}
      <div className={styles['host']} role="region" aria-label="Notifications">
        {toasts.map((toast) => (
          <button
            key={toast.id}
            type="button"
            className={`${styles['toast']} ${toast.tone === 'error' ? styles['error'] : ''}`}
            onClick={() => dismiss(toast.id)}
          >
            <strong>{toast.title}</strong>
            <span>{toast.message}</span>
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

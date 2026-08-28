import { useEffect, useState, type JSX, type ReactNode } from 'react';

import styles from './Transition.module.css';

export type TransitionKind = 'fade' | 'fade-slide-up' | 'fade-scale';

export interface TransitionProps {
  readonly show: boolean;
  readonly kind?: TransitionKind;
  readonly children: ReactNode;
}

/**
 * Mounts/unmounts `children` across a token-driven enter/exit transition (#325). `tokens.css`
 * already zeroes `--motion-*` under `prefers-reduced-motion: reduce`, so a reduced-motion
 * visitor gets the same mount timing as everyone else with no visible animation — there's
 * nothing extra to opt out of here.
 *
 * Deliberately not `AnimatePresence`-style exit-before-unmount: nothing in this app animates
 * a remove that must finish before the DOM node can disappear, so a plain
 * `show ? render : keep rendering one more frame for the fade` covers every caller today.
 *
 * `show` flipping is handled during render (React's documented "adjust state during render"
 * pattern), not a `useEffect` — a synchronous `setState` in an effect body is the cascading-
 * render anti-pattern `react-hooks/set-state-in-effect` flags. The effect below only ever
 * calls `setState` from inside a `requestAnimationFrame`/`setTimeout` callback, which the rule
 * allows: that's the async "subscribe to an external clock" case it exists to distinguish from
 * a synchronous echo of props.
 */
export function Transition({ show, kind = 'fade', children }: TransitionProps): JSX.Element | null {
  const [prevShow, setPrevShow] = useState(show);
  const [mounted, setMounted] = useState(show);
  const [entered, setEntered] = useState(show);

  if (show !== prevShow) {
    setPrevShow(show);
    setEntered(false);
    if (show) setMounted(true);
  }

  useEffect(() => {
    if (!mounted) return undefined;
    if (show) {
      const frame = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(frame);
    }
    const timeout = setTimeout(() => setMounted(false), 220);
    return () => clearTimeout(timeout);
  }, [show, mounted]);

  if (!mounted) return null;

  return (
    <div className={`${styles['transition']} ${styles[kind]} ${entered ? styles['entered'] : ''}`}>
      {children}
    </div>
  );
}

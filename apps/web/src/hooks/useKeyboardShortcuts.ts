import { useEffect, useRef } from 'react';

export type ShortcutMap = Record<string, (event: KeyboardEvent) => void>;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

/**
 * Registers single-key shortcuts (no modifiers) mirroring the TUI's bindings
 * (`apps/tui`'s `j`/`k`/`?` conventions). Ignored while the user is typing in
 * a form field, and while any modifier key is held (so browser/OS shortcuts
 * that happen to share a letter still work).
 *
 * `shortcuts` is read from a ref updated every render, so callers can pass a
 * fresh object literal each render without re-subscribing the window listener
 * (and without needing an exhaustive-deps suppression).
 */
export function useKeyboardShortcuts(shortcuts: ShortcutMap, enabled = true): void {
  const shortcutsRef = useRef(shortcuts);
  useEffect(() => {
    shortcutsRef.current = shortcuts;
  });

  useEffect(() => {
    if (!enabled) return;
    const handler = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      const handlerFn = shortcutsRef.current[event.key];
      if (handlerFn) {
        event.preventDefault();
        handlerFn(event);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled]);
}

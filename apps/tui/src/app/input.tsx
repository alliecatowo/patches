import type { Key } from 'ink';
import { createContext, useContext, useLayoutEffect, useMemo, useRef } from 'react';
import type { ReactElement, ReactNode } from 'react';

export interface KeyLayer {
  id: string;
  /** Return true when this layer consumed the key. */
  onKey(input: string, key: Key): boolean;
}

export interface KeyLayerStack {
  register(layer: () => KeyLayer): () => void;
  dispatch(input: string, key: Key): boolean;
  size(): number;
}

export function createKeyLayerStack(): KeyLayerStack {
  const layers = new Map<symbol, () => KeyLayer>();
  return {
    register(layer) {
      const token = Symbol(layer().id);
      layers.set(token, layer);
      return () => layers.delete(token);
    },
    dispatch(input, key) {
      const ordered = [...layers.values()].reverse();
      for (const readLayer of ordered) {
        if (readLayer().onKey(input, key)) return true;
      }
      return false;
    },
    size: () => layers.size,
  };
}

const KeyLayerContext = createContext<KeyLayerStack | undefined>(undefined);

export function KeyLayerProvider({
  stack,
  children,
}: {
  stack: KeyLayerStack;
  children: ReactNode;
}): ReactElement {
  return <KeyLayerContext.Provider value={stack}>{children}</KeyLayerContext.Provider>;
}

/**
 * Registers a screen/modal layer with the shell's single dispatcher. Existing
 * screens can migrate one at a time without introducing another shell handler.
 */
export function useKeyLayer(layer: KeyLayer, isActive = true): void {
  const stack = useContext(KeyLayerContext);
  const current = useRef(layer);
  const stableReader = useMemo(() => () => current.current, []);

  // Refs may not be written during render (react-hooks/refs). This layout effect runs
  // before the registration effect below, so a freshly mounted layer is never stale.
  useLayoutEffect(() => {
    current.current = layer;
  });

  useLayoutEffect(() => {
    if (!isActive || stack === undefined) return;
    return stack.register(stableReader);
  }, [isActive, stableReader, stack]);
}

export function isCtrlKey(input: string, key: Key, letter: string): boolean {
  return key.ctrl && input.toLowerCase() === letter.toLowerCase();
}

export function isPaletteShortcut(input: string, key: Key): boolean {
  return input === ':' || isCtrlKey(input, key, 'p');
}

export function isPrintableInput(input: string, key: Key): boolean {
  return input.length > 0 && !key.ctrl && !key.meta && !key.super && !key.hyper;
}

/**
 * Compatibility layer for screens that still own a legacy `useInput`. It
 * consumes shell-visible text and Esc while letting the legacy hook process the
 * same event. Ctrl+C and Ctrl+P deliberately fall through to shell safety.
 */
export function legacyInputConsumes(input: string, key: Key, active: boolean): boolean {
  if (!active) return false;
  if (isCtrlKey(input, key, 'c') || isCtrlKey(input, key, 'p')) return false;
  if (key.escape) return true;
  return isPrintableInput(input, key);
}

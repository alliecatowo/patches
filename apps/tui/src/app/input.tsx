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

/**
 * True when `input` is several ordinary characters that arrived in one stdin read.
 *
 * Ink parses each chunk into exactly *one* keypress (`use-input.js` calls
 * `parseKeypress(data)` per data event), so two keys typed faster than the terminal
 * flushes appear as a single multi-character `input`. A two-key sequence like `g h`
 * would then never be recognised — the shell would look for `g` and be handed `gh`.
 * Splitting such a run back into its keys is what makes fast typing behave like slow
 * typing. Iterated by code point so an emoji stays one key.
 */
export function isCoalescedKeyRun(input: string, key: Key): boolean {
  if (!isPrintableInput(input, key)) return false;
  if (key.return || key.escape || key.tab || key.backspace || key.delete) return false;
  if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) return false;
  if (key.pageUp || key.pageDown || key.home || key.end) return false;
  return [...input].length > 1;
}

export function isPrintableInput(input: string, key: Key): boolean {
  return input.length > 0 && !key.ctrl && !key.meta && !key.super && !key.hyper;
}

/**
 * Splits a coalesced chunk (see `isCoalescedKeyRun`) back into per-key `{input, key}`
 * pairs, replaying Ink's own single-byte ctrl-key parsing for any raw control byte
 * (`\x01`-`\x1a`) found inside the run.
 *
 * Ink's `parseKeypress` only recognises a ctrl+letter chord (`key.ctrl = true`,
 * `key.name = 'w'`) when the byte arrives *alone* (`s.length === 1 && s <= '\x1a'`,
 * `ink/build/parse-keypress.js`). A `Ctrl+W` typed fast enough to land in the same
 * stdin chunk as its follow-up key (`Ctrl+W` then `h`) instead reaches `useInput` as
 * the two-character string `'\x17h'` with `key.ctrl` already `false` on the whole
 * event — naively replaying each character with that one shared `key` object loses
 * the ctrl flag entirely, so a prefix chord like `Ctrl+W h` would silently never
 * fire under fast typing. This reconstructs the per-character key exactly as a
 * standalone press would have parsed it.
 */
export function splitCoalescedKeyRun(input: string, key: Key): Array<{ input: string; key: Key }> {
  return [...input].map((character) => {
    const code = character.codePointAt(0) ?? 0;
    if (code >= 1 && code <= 26) {
      return { input: String.fromCharCode(code + 96), key: { ...key, ctrl: true } };
    }
    return { input: character, key };
  });
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

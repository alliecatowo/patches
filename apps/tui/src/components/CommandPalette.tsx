import { Box, Text } from 'ink';
import { useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';

import {
  completeCommand,
  filterCommands,
  filterPaletteBindings,
  paletteBindings,
  parseCommand,
  type Command,
  type CommandHistory,
  type CommandInvocation,
} from '../app/commands.js';
import { useKeyLayer } from '../app/input.js';
import type { Binding, Screen } from '../app/keymap.js';
import { useContentSize } from '../app/layout.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { theme } from '../theme/index.js';
import { computeViewport, resolveTopIndex } from './list-viewport.js';

export type PaletteInvocation =
  CommandInvocation | { source: 'palette'; binding: Binding; args: readonly string[] };

export interface CommandPaletteProps {
  screen: Screen;
  authenticated: boolean;
  history: CommandHistory;
  onInvoke: (invocation: PaletteInvocation) => void;
  onError: (message: string) => void;
  onClose: () => void;
  initialQuery?: string;
  /** Row verbs and mention/tag/link commands for whatever post the palette was opened
   * over (`app/commands.js`'s `contextualCommands`, P12-116) — shown ahead of the
   * static `KEYMAP` bindings and fuzzy-filtered by the same query. Omitted (or empty)
   * when the palette wasn't opened over a selection; nothing about the merged list
   * changes in that case. */
  contextualCommands?: readonly Command[];
}

type PaletteItem = { kind: 'command'; command: Command } | { kind: 'binding'; binding: Binding };

function isUnknownCommand(error: string): boolean {
  return error.startsWith('Unknown command:');
}

/** `:` command line and fuzzy command palette, backed by `KEYMAP` plus (when opened
 * over a post) the contextual commands parsed from it. */
export function CommandPalette({
  screen,
  authenticated,
  history,
  onInvoke,
  onError,
  onClose,
  initialQuery = '',
  contextualCommands: contextual = [],
}: CommandPaletteProps): ReactElement {
  const content = useContentSize();
  const available = useMemo(() => paletteBindings(screen, authenticated), [authenticated, screen]);
  const initial = initialQuery.replace(/^:/u, '');
  const [query, setQueryState] = useState(initial);
  const queryRef = useRef(initial);
  // `{ index, top }` mirrors `VirtualList`'s own selection shape (B-043: the palette
  // list must scroll to keep the selection visible, the same as every other measured
  // list) — `top` is the window's last position, derived forward each render by
  // `resolveTopIndex` rather than written back from an effect.
  const [selection, setSelectionState] = useState<{ index: number; top: number }>({
    index: 0,
    top: 0,
  });
  const selectionRef = useRef(selection);
  const [historyIndex, setHistoryIndex] = useState<number | undefined>(undefined);
  const commandWord = query.trimStart().split(/\s/u)[0] ?? '';
  const filteredCommands = filterCommands(commandWord, contextual);
  const filteredBindings = filterPaletteBindings(commandWord, available);
  const items: PaletteItem[] = [
    ...filteredCommands.map((command): PaletteItem => ({ kind: 'command', command })),
    ...filteredBindings.map((binding): PaletteItem => ({ kind: 'binding', binding })),
  ];
  const effectiveSelected = Math.min(selection.index, Math.max(0, items.length - 1));
  const visibleRows = Math.max(1, Math.min(8, content.rows - 3));
  // Every row is exactly one line — `list-viewport.ts` still owns the scrolling
  // arithmetic so there is one viewport algorithm in the app, not a second ad-hoc one.
  const heights = items.map(() => 1);
  const topIndex = resolveTopIndex(selection.top, effectiveSelected, heights, visibleRows);
  const viewport = computeViewport(topIndex, heights, visibleRows);
  const visible = items.slice(viewport.start, viewport.end);

  function setQuery(next: string | ((current: string) => string)): void {
    const value = typeof next === 'string' ? next : next(queryRef.current);
    queryRef.current = value;
    setQueryState(value);
  }

  function select(next: number | ((current: number) => number)): void {
    const index = typeof next === 'number' ? next : next(selectionRef.current.index);
    const value = { index, top: topIndex };
    selectionRef.current = value;
    setSelectionState(value);
  }

  function recallHistory(direction: -1 | 1): void {
    const entries = history.entries();
    if (entries.length === 0) return;
    const next =
      historyIndex === undefined
        ? direction < 0
          ? entries.length - 1
          : 0
        : Math.max(0, Math.min(entries.length - 1, historyIndex + direction));
    setHistoryIndex(next);
    setQuery(entries[next] ?? '');
    select(0);
  }

  function invoke(): void {
    const trimmed = queryRef.current.trim();
    const currentWord = trimmed.split(/\s/u)[0] ?? '';
    const currentCommands = filterCommands(currentWord, contextual);
    const currentBindings = filterPaletteBindings(currentWord, available);
    if (trimmed !== '') {
      const parsed = parseCommand(trimmed);
      if (parsed.ok) {
        history.add(trimmed);
        onClose();
        onInvoke(parsed.invocation);
        return;
      }
      if (!isUnknownCommand(parsed.error)) {
        onError(parsed.error);
        return;
      }
    }
    const index = selectionRef.current.index;
    if (index < currentCommands.length) {
      const command = currentCommands[index];
      if (command === undefined) {
        onError('No command is selected.');
        return;
      }
      onClose();
      command.run();
      return;
    }
    const binding = currentBindings[index - currentCommands.length];
    if (binding === undefined) {
      onError(trimmed === '' ? 'No command is selected.' : `No command matches “${trimmed}”.`);
      return;
    }
    onClose();
    onInvoke({ source: 'palette', binding, args: [] });
  }

  useKeyLayer({
    id: 'command-palette',
    onKey(input, key) {
      if (key.escape) {
        onClose();
        return true;
      }
      if (key.upArrow) {
        recallHistory(-1);
        return true;
      }
      if (key.downArrow) {
        recallHistory(1);
        return true;
      }
      if (query === '' && input === 'j') {
        select((current) => Math.min(current + 1, Math.max(0, items.length - 1)));
        return true;
      }
      if (query === '' && input === 'k') {
        select((current) => Math.max(0, current - 1));
        return true;
      }
      if (key.tab) {
        setQuery((current) => completeCommand(current));
        select(0);
        return true;
      }
      if (key.return) {
        invoke();
        return true;
      }
      if (key.backspace || key.delete) {
        setQuery((current) => current.slice(0, -1));
        setHistoryIndex(undefined);
        select(0);
        return true;
      }
      if (key.ctrl || key.meta || key.super || key.hyper) return true;
      if (input.length > 0) {
        setQuery((current) => current + input);
        setHistoryIndex(undefined);
        select(0);
      }
      return true;
    },
  });

  return (
    <Box flexDirection="column" height={visibleRows + 2} overflow="hidden">
      <Text color={theme.accent} bold wrap="truncate-end">
        :{sanitizeForTerminal(query)}█
      </Text>
      {visible.map((item, offset) => {
        const index = viewport.start + offset;
        const key =
          item.kind === 'command'
            ? `command:${item.command.id}`
            : `binding:${item.binding.keys}:${item.binding.hint}`;
        const label =
          item.kind === 'command'
            ? item.command.label
            : (item.binding.description ?? item.binding.hint);
        const hint = item.kind === 'command' ? item.command.hint : item.binding.keys;
        return (
          <Box key={key} height={1} flexShrink={0} overflow="hidden">
            <Text
              color={index === effectiveSelected ? theme.accent : theme.muted}
              wrap="truncate-end"
            >
              {index === effectiveSelected ? '› ' : '  '}
              {label}
              {hint === '' ? null : <Text color={theme.warn}> ({hint})</Text>}
            </Text>
          </Box>
        );
      })}
      <Text color={theme.muted} wrap="truncate-end">
        Enter run · Tab complete · ↑/↓ history · Esc close
      </Text>
    </Box>
  );
}

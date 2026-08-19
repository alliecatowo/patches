import { Box, Text, useInput, usePaste, useStdin } from 'ink';
import { useEffect, useRef, useState, type ReactElement } from 'react';

import {
  clampEditorCursor,
  editorCellColumn,
  editorLineBounds,
  fitEditorInsertion,
  layoutEditor,
  moveEditorCursorVertical,
  nextEditorCursor,
  nextEditorWord,
  normalizeEditorInsertion,
  previousEditorCursor,
  previousEditorWord,
  type EditorSnapshot,
} from './text-editor-model.js';

const HISTORY_LIMIT = 50;

export interface TextEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Exact terminal-cell budget. The editor never renders outside this rectangle. */
  columns: number;
  rows: number;
  maxChars?: number;
  isActive?: boolean;
  /** Explicit `| undefined` (not just optional) so a caller that recomputes this on
   * every render — e.g. after an autocomplete accept forces a remount, ComposeScreen
   * §7 — can pass `undefined` under `exactOptionalPropertyTypes` without a conditional
   * spread. */
  initialCursor?: number | undefined;
  onCursorChange?: (cursor: number) => void;
  onEscape?: () => void;
  /** Invoked by Ctrl+S or modified Enter; ordinary Enter always inserts a newline. */
  onSubmit?: (value: string) => void;
  ariaLabel?: string;
  /**
   * A sibling popover (`Autocomplete`) is open and owns Escape/↑↓/Enter for this
   * keystroke — the editor still takes character input, backspace/delete, and
   * left/right so the query text keeps updating live, but yields the four keys the
   * popover needs so a suggestion select doesn't also move the cursor line, and
   * closing the popover doesn't also cancel the whole screen (interaction model §7).
   */
  autocompleteOpen?: boolean;
  /**
   * Runs before a bracketed paste is inserted as text. Returning `true` means the
   * caller fully handled the paste (e.g. detected an attachable file path,
   * P12-111) — the editor does not insert anything for that paste.
   */
  interceptPaste?: (pastedText: string) => boolean;
}

function boundedHistory(
  history: readonly EditorSnapshot[],
  snapshot: EditorSnapshot,
): EditorSnapshot[] {
  return [...history, snapshot].slice(-HISTORY_LIMIT);
}

function isTextInput(input: string): boolean {
  return input.length > 0 && input !== '\r' && input !== '\n';
}

/** Controlled, terminal-cell-aware multiline editor for compose and search surfaces. */
export function TextEditor({
  value,
  onChange,
  columns,
  rows,
  maxChars,
  isActive = true,
  initialCursor = value.length,
  onCursorChange,
  onEscape,
  onSubmit,
  ariaLabel = 'Text editor',
  autocompleteOpen = false,
  interceptPaste,
}: TextEditorProps): ReactElement {
  const { isRawModeSupported } = useStdin();
  const interactive = isActive && isRawModeSupported;
  const initialEditorCursor = clampEditorCursor(value, initialCursor);
  const modelRef = useRef<EditorSnapshot>({ value, cursor: initialEditorCursor });
  const preferredColumnRef = useRef<number | null>(null);
  const undoRef = useRef<EditorSnapshot[]>([]);
  const redoRef = useRef<EditorSnapshot[]>([]);
  const [cursor, setCursor] = useState(initialEditorCursor);
  const displayCursor = clampEditorCursor(value, cursor);

  useEffect(() => {
    modelRef.current = { value, cursor: displayCursor };
  }, [displayCursor, value]);

  const moveCursor = (nextCursor: number, preservePreferredColumn = false): void => {
    const next = clampEditorCursor(modelRef.current.value, nextCursor);
    modelRef.current.cursor = next;
    if (!preservePreferredColumn) preferredColumnRef.current = null;
    setCursor(next);
  };

  const emitSnapshot = (snapshot: EditorSnapshot): void => {
    const nextCursor = clampEditorCursor(snapshot.value, snapshot.cursor);
    modelRef.current = { value: snapshot.value, cursor: nextCursor };
    preferredColumnRef.current = null;
    setCursor(nextCursor);
    onChange(snapshot.value);
  };

  const edit = (nextValue: string, nextCursor: number): void => {
    const { value: currentValue, cursor: currentCursor } = modelRef.current;
    if (nextValue === currentValue) return;
    undoRef.current = boundedHistory(undoRef.current, {
      value: currentValue,
      cursor: currentCursor,
    });
    redoRef.current = [];
    emitSnapshot({ value: nextValue, cursor: nextCursor });
  };

  const insert = (rawInsertion: string): void => {
    const { value: currentValue, cursor: currentCursor } = modelRef.current;
    const normalized = normalizeEditorInsertion(rawInsertion);
    const insertion = fitEditorInsertion(currentValue, normalized, maxChars);
    if (insertion === '') return;
    edit(
      `${currentValue.slice(0, currentCursor)}${insertion}${currentValue.slice(currentCursor)}`,
      currentCursor + insertion.length,
    );
  };

  const undo = (): void => {
    const snapshot = undoRef.current.pop();
    if (snapshot === undefined) return;
    redoRef.current = boundedHistory(redoRef.current, {
      value: modelRef.current.value,
      cursor: modelRef.current.cursor,
    });
    emitSnapshot(snapshot);
  };

  const redo = (): void => {
    const snapshot = redoRef.current.pop();
    if (snapshot === undefined) return;
    undoRef.current = boundedHistory(undoRef.current, {
      value: modelRef.current.value,
      cursor: modelRef.current.cursor,
    });
    emitSnapshot(snapshot);
  };

  useInput(
    (input, key) => {
      if (key.eventType === 'release') return;
      const { value: currentValue, cursor: currentCursor } = modelRef.current;
      const lowerInput = input.toLowerCase();

      if (key.escape) {
        // While the autocomplete popover is open, Escape closes only the popover
        // (its own `useInput` handles that) — it must not also cancel compose.
        if (!autocompleteOpen) onEscape?.();
        return;
      }
      if ((key.ctrl && key.return) || (key.ctrl && lowerInput === 's')) {
        onSubmit?.(currentValue);
        return;
      }
      if (key.ctrl && lowerInput === 'a') {
        moveCursor(editorLineBounds(currentValue, currentCursor).start);
        return;
      }
      if (key.ctrl && lowerInput === 'e') {
        moveCursor(editorLineBounds(currentValue, currentCursor).end);
        return;
      }
      if (key.ctrl && lowerInput === 'k') {
        const line = editorLineBounds(currentValue, currentCursor);
        const end =
          currentCursor < line.end ? line.end : Math.min(line.end + 1, currentValue.length);
        edit(`${currentValue.slice(0, currentCursor)}${currentValue.slice(end)}`, currentCursor);
        return;
      }
      if (key.ctrl && lowerInput === 'w') {
        const start = previousEditorWord(currentValue, currentCursor);
        edit(`${currentValue.slice(0, start)}${currentValue.slice(currentCursor)}`, start);
        return;
      }
      if (key.ctrl && lowerInput === 'z') {
        undo();
        return;
      }
      if (key.ctrl && lowerInput === 'y') {
        redo();
        return;
      }
      if (key.meta && key.leftArrow) {
        moveCursor(previousEditorWord(currentValue, currentCursor));
        return;
      }
      if (key.meta && key.rightArrow) {
        moveCursor(nextEditorWord(currentValue, currentCursor));
        return;
      }
      if (key.home) {
        moveCursor(editorLineBounds(currentValue, currentCursor).start);
        return;
      }
      if (key.end) {
        moveCursor(editorLineBounds(currentValue, currentCursor).end);
        return;
      }
      if (key.leftArrow) {
        moveCursor(previousEditorCursor(currentValue, currentCursor));
        return;
      }
      if (key.rightArrow) {
        moveCursor(nextEditorCursor(currentValue, currentCursor));
        return;
      }
      if (key.upArrow || key.downArrow) {
        // The popover owns ↑↓ for selecting a suggestion while it is open.
        if (autocompleteOpen) return;
        const preferred =
          preferredColumnRef.current ?? editorCellColumn(currentValue, currentCursor);
        preferredColumnRef.current = preferred;
        moveCursor(
          moveEditorCursorVertical(currentValue, currentCursor, key.upArrow ? -1 : 1, preferred),
          true,
        );
        return;
      }
      if (key.backspace) {
        const start = previousEditorCursor(currentValue, currentCursor);
        edit(`${currentValue.slice(0, start)}${currentValue.slice(currentCursor)}`, start);
        return;
      }
      if (key.delete) {
        const end = nextEditorCursor(currentValue, currentCursor);
        edit(`${currentValue.slice(0, currentCursor)}${currentValue.slice(end)}`, currentCursor);
        return;
      }
      if (key.return) {
        // The popover owns Enter to accept a suggestion while it is open.
        if (autocompleteOpen) return;
        insert('\n');
        return;
      }
      if (!key.ctrl && !key.meta && !key.tab && isTextInput(input)) insert(input);
    },
    { isActive: interactive },
  );

  usePaste(
    (pastedText) => {
      if (interceptPaste?.(pastedText) === true) return;
      insert(pastedText);
    },
    { isActive: interactive },
  );

  useEffect(() => {
    onCursorChange?.(displayCursor);
  }, [displayCursor, onCursorChange]);

  const height = Math.max(1, Math.trunc(rows));
  const width = Math.max(1, Math.trunc(columns));
  const layout = layoutEditor(value, displayCursor, width);
  const scrollTop = Math.min(
    Math.max(0, layout.cursorRow - height + 1),
    Math.max(0, layout.rows.length - height),
  );
  const visibleRows = layout.rows.slice(scrollTop, scrollTop + height);

  return (
    <Box
      aria-label={ariaLabel}
      aria-role="textbox"
      aria-state={{ multiline: true }}
      flexDirection="column"
      flexShrink={0}
      height={height}
      width={width}
      overflow="hidden"
    >
      {visibleRows.map((parts, rowIndex) => (
        <Text key={`${String(scrollTop + rowIndex)}:${parts.map((part) => part.text).join('')}`}>
          {parts.map((part, partIndex) => (
            <Text
              key={`${String(partIndex)}:${part.cursor ? 'cursor' : 'text'}`}
              inverse={part.cursor}
            >
              {part.text}
            </Text>
          ))}
        </Text>
      ))}
    </Box>
  );
}

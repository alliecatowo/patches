import stringWidth from 'string-width';

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const WORD_GRAPHEME = /^[\p{L}\p{N}_]/u;
const CONTROL_CHARACTER = /[\p{Cc}\p{Cf}]/gu;

export interface EditorSnapshot {
  value: string;
  cursor: number;
}

interface Grapheme {
  text: string;
  start: number;
  end: number;
  width: number;
}

export interface EditorRowPart {
  text: string;
  cursor: boolean;
}

export interface EditorLayout {
  rows: readonly (readonly EditorRowPart[])[];
  cursorRow: number;
}

function graphemes(value: string, offset = 0): Grapheme[] {
  return [...graphemeSegmenter.segment(value)].map(({ segment, index }) => ({
    text: segment,
    start: offset + index,
    end: offset + index + segment.length,
    width: stringWidth(segment),
  }));
}

function cursorBoundaries(value: string): number[] {
  return [0, ...graphemes(value).map((grapheme) => grapheme.end)];
}

/** Clamp a UTF-16 cursor offset to the nearest preceding grapheme boundary. */
export function clampEditorCursor(value: string, cursor: number): number {
  const requested = Math.min(Math.max(Math.trunc(cursor), 0), value.length);
  let boundary = 0;
  for (const candidate of cursorBoundaries(value)) {
    if (candidate > requested) break;
    boundary = candidate;
  }
  return boundary;
}

export function previousEditorCursor(value: string, cursor: number): number {
  const current = clampEditorCursor(value, cursor);
  let previous = 0;
  for (const boundary of cursorBoundaries(value)) {
    if (boundary >= current) break;
    previous = boundary;
  }
  return previous;
}

export function nextEditorCursor(value: string, cursor: number): number {
  const current = clampEditorCursor(value, cursor);
  return cursorBoundaries(value).find((boundary) => boundary > current) ?? value.length;
}

export interface EditorLineBounds {
  start: number;
  end: number;
}

export function editorLineBounds(value: string, cursor: number): EditorLineBounds {
  const current = clampEditorCursor(value, cursor);
  const previousNewline = current === 0 ? -1 : value.lastIndexOf('\n', current - 1);
  const nextNewline = value.indexOf('\n', current);
  return {
    start: previousNewline < 0 ? 0 : previousNewline + 1,
    end: nextNewline < 0 ? value.length : nextNewline,
  };
}

export function editorCellColumn(value: string, cursor: number): number {
  const current = clampEditorCursor(value, cursor);
  const line = editorLineBounds(value, current);
  return stringWidth(value.slice(line.start, current));
}

function cursorAtCellColumn(value: string, line: EditorLineBounds, column: number): number {
  let cursor = line.start;
  let width = 0;
  for (const grapheme of graphemes(value.slice(line.start, line.end), line.start)) {
    if (width + grapheme.width > column) break;
    width += grapheme.width;
    cursor = grapheme.end;
  }
  return cursor;
}

export function moveEditorCursorVertical(
  value: string,
  cursor: number,
  direction: -1 | 1,
  preferredColumn: number,
): number {
  const current = clampEditorCursor(value, cursor);
  const line = editorLineBounds(value, current);
  if (direction < 0) {
    if (line.start === 0) return current;
    const previousEnd = line.start - 1;
    const previousLine = editorLineBounds(value, previousEnd);
    return cursorAtCellColumn(value, previousLine, preferredColumn);
  }
  if (line.end === value.length) return current;
  const nextStart = line.end + 1;
  const nextLine = editorLineBounds(value, nextStart);
  return cursorAtCellColumn(value, nextLine, preferredColumn);
}

function graphemeKind(grapheme: string): 'space' | 'word' | 'punctuation' {
  if (/^\s$/u.test(grapheme)) return 'space';
  if (WORD_GRAPHEME.test(grapheme)) return 'word';
  return 'punctuation';
}

export function previousEditorWord(value: string, cursor: number): number {
  const items = graphemes(value);
  let index = items.findIndex((item) => item.end >= clampEditorCursor(value, cursor));
  if (index < 0) index = items.length;
  if (items[index]?.end === cursor) index += 1;

  while (index > 0 && graphemeKind(items[index - 1]?.text ?? '') === 'space') index -= 1;
  const kind = graphemeKind(items[index - 1]?.text ?? '');
  while (index > 0 && graphemeKind(items[index - 1]?.text ?? '') === kind) index -= 1;
  return items[index]?.start ?? value.length;
}

export function nextEditorWord(value: string, cursor: number): number {
  const items = graphemes(value);
  const current = clampEditorCursor(value, cursor);
  let index = items.findIndex((item) => item.start >= current);
  if (index < 0) return value.length;

  while (index < items.length && graphemeKind(items[index]?.text ?? '') === 'space') index += 1;
  const kind = graphemeKind(items[index]?.text ?? '');
  while (index < items.length && graphemeKind(items[index]?.text ?? '') === kind) index += 1;
  return items[index]?.start ?? value.length;
}

/** Normalize terminal paste without allowing hidden controls into editable content. */
export function normalizeEditorInsertion(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .replace(CONTROL_CHARACTER, (character) => (character === '\n' ? character : ''));
}

/** Truncate inserted content without splitting a Unicode code point. */
export function fitEditorInsertion(
  currentValue: string,
  insertion: string,
  maxChars: number | undefined,
): string {
  if (maxChars === undefined) return insertion;
  const room = Math.max(0, Math.trunc(maxChars) - [...currentValue].length);
  return [...insertion].slice(0, room).join('');
}

function pushRow(
  rows: EditorRowPart[][],
  parts: EditorRowPart[],
  cursorRow: { value: number },
): void {
  if (parts.some((part) => part.cursor)) cursorRow.value = rows.length;
  rows.push(parts.length === 0 ? [{ text: ' ', cursor: false }] : parts);
}

function appendPart(parts: EditorRowPart[], text: string, cursor: boolean): void {
  const previous = parts.at(-1);
  if (previous !== undefined && previous.cursor === cursor) {
    previous.text += text;
  } else {
    parts.push({ text, cursor });
  }
}

/** Hard-wrap editable text to terminal cells and insert a one-cell visible cursor. */
export function layoutEditor(value: string, cursor: number, columns: number): EditorLayout {
  const width = Math.max(1, Math.trunc(columns));
  const current = clampEditorCursor(value, cursor);
  const rows: EditorRowPart[][] = [];
  const cursorRow = { value: 0 };
  let lineStart = 0;

  while (lineStart <= value.length) {
    const newline = value.indexOf('\n', lineStart);
    const lineEnd = newline < 0 ? value.length : newline;
    const lineItems = graphemes(value.slice(lineStart, lineEnd), lineStart).map((item) => ({
      ...item,
      cursor: item.start === current,
    }));
    if (current === lineEnd) {
      lineItems.push({ text: ' ', start: current, end: current, width: 1, cursor: true });
    }

    let parts: EditorRowPart[] = [];
    let used = 0;
    for (const item of lineItems) {
      const display = item.text === '\t' ? ' ' : item.width > width ? '�' : item.text;
      const itemWidth = Math.max(1, Math.min(item.width, width));
      if (used > 0 && used + itemWidth > width) {
        pushRow(rows, parts, cursorRow);
        parts = [];
        used = 0;
      }
      appendPart(parts, display, item.cursor);
      used += itemWidth;
    }
    pushRow(rows, parts, cursorRow);

    if (newline < 0) break;
    lineStart = newline + 1;
  }

  return { rows, cursorRow: cursorRow.value };
}

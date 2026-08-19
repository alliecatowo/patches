import { render } from 'ink-testing-library';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { TextEditor, type TextEditorProps } from './TextEditor.js';
import {
  layoutEditor,
  moveEditorCursorVertical,
  nextEditorWord,
  previousEditorWord,
} from './text-editor-model.js';

const KEY = {
  left: '\u001B[D',
  up: '\u001B[A',
  home: '\u001B[H',
  end: '\u001B[F',
  delete: '\u001B[3~',
  backspace: '\u007F',
  enter: '\r',
  escape: '\u001B',
  ctrlK: '\u000B',
  ctrlS: '\u0013',
  ctrlW: '\u0017',
  ctrlY: '\u0019',
  ctrlZ: '\u001A',
} as const;

interface HarnessProps extends Omit<TextEditorProps, 'value' | 'onChange' | 'columns' | 'rows'> {
  initialValue: string;
  onValue: (value: string) => void;
  columns?: number;
  rows?: number;
}

function EditorHarness({ initialValue, onValue, columns = 12, rows = 3, ...props }: HarnessProps) {
  const [value, setValue] = useState(initialValue);
  return (
    <TextEditor
      {...props}
      value={value}
      columns={columns}
      rows={rows}
      onChange={(nextValue) => {
        onValue(nextValue);
        setValue(nextValue);
      }}
    />
  );
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('TextEditor model', () => {
  it('moves vertically by terminal-cell column and moves by words', () => {
    expect(moveEditorCursorVertical('ab\n12345\nx', 1, 1, 1)).toBe(4);
    expect(moveEditorCursorVertical('ab\n12345\nx', 4, -1, 1)).toBe(1);
    expect(moveEditorCursorVertical('\nabc', 0, 1, 0)).toBe(1);
    expect(previousEditorWord('one two', 7)).toBe(4);
    expect(previousEditorWord('one two', 4)).toBe(0);
    expect(nextEditorWord('one two', 0)).toBe(3);
    expect(nextEditorWord('one two', 3)).toBe(7);
  });

  it('hard-wraps by terminal cells and puts an end cursor on a new row when needed', () => {
    const layout = layoutEditor('abcd', 4, 4);
    expect(layout.rows).toHaveLength(2);
    expect(layout.cursorRow).toBe(1);
    expect(layout.rows[1]).toEqual([{ text: ' ', cursor: true }]);

    const wide = layoutEditor('界a', 0, 2);
    expect(wide.rows).toHaveLength(2);
    expect(wide.rows[0]).toEqual([{ text: '界', cursor: true }]);
  });
});

describe('TextEditor', () => {
  it('edits at a multiline cursor with arrows, Home/End, backspace, and delete', async () => {
    const values: string[] = [];
    const rendered = render(
      <EditorHarness initialValue={'ab\ncd'} onValue={(value) => values.push(value)} />,
    );

    rendered.stdin.write(KEY.up);
    rendered.stdin.write(KEY.left);
    rendered.stdin.write('X');
    await settle();
    expect(values.at(-1)).toBe('aXb\ncd');

    rendered.stdin.write(KEY.home);
    rendered.stdin.write(KEY.delete);
    rendered.stdin.write(KEY.end);
    rendered.stdin.write(KEY.backspace);
    await settle();
    expect(values.at(-1)).toBe('X\ncd');
  });

  it('supports kill/delete-word and a bounded undo/redo history', async () => {
    const values: string[] = [];
    const rendered = render(
      <EditorHarness
        initialValue={'one two\nthree'}
        initialCursor={7}
        onValue={(value) => values.push(value)}
      />,
    );

    rendered.stdin.write(KEY.ctrlW);
    rendered.stdin.write(KEY.ctrlK);
    expect(values.at(-1)).toBe('one three');
    rendered.stdin.write(KEY.ctrlZ);
    rendered.stdin.write(KEY.ctrlZ);
    expect(values.at(-1)).toBe('one two\nthree');
    rendered.stdin.write(KEY.ctrlY);
    expect(values.at(-1)).toBe('one \nthree');

    for (let index = 0; index < 55; index += 1) rendered.stdin.write('x');
    for (let index = 0; index < 55; index += 1) rendered.stdin.write(KEY.ctrlZ);
    await settle();
    expect(values.at(-1)).toBe('one xxxxx\nthree');
  });

  it('treats multiline bracketed paste as one capped undo edit', async () => {
    const values: string[] = [];
    const rendered = render(
      <EditorHarness initialValue="x" maxChars={5} onValue={(value) => values.push(value)} />,
    );

    rendered.stdin.write('\u001B[200~a\r\nbcdef\u001B[201~');
    await settle();
    expect(values.at(-1)).toBe('xa\nbc');
    rendered.stdin.write(KEY.ctrlZ);
    expect(values.at(-1)).toBe('x');
  });

  it('keeps the cursor visible by scrolling inside its fixed row budget', () => {
    const rendered = render(
      <EditorHarness initialValue={'one\ntwo\nthree\nfour'} onValue={() => undefined} rows={2} />,
    );
    const frame = rendered.lastFrame() ?? '';
    expect(frame.split('\n')).toHaveLength(2);
    expect(frame).toContain('four');
    expect(frame).not.toContain('one');
  });

  it('exposes Escape and submit callbacks while Enter remains a newline', async () => {
    const onEscape = vi.fn();
    const onSubmit = vi.fn();
    const values: string[] = [];
    const rendered = render(
      <EditorHarness
        initialValue="hello"
        onEscape={onEscape}
        onSubmit={onSubmit}
        onValue={(value) => values.push(value)}
      />,
    );

    rendered.stdin.write(KEY.enter);
    expect(values.at(-1)).toBe('hello\n');
    rendered.stdin.write(KEY.ctrlS);
    expect(onSubmit).toHaveBeenCalledWith('hello\n');
    rendered.stdin.write(KEY.escape);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(onEscape).toHaveBeenCalledOnce();
  });

  it('yields Escape/↑↓/Enter to a sibling popover while autocompleteOpen, but keeps typing', async () => {
    const onEscape = vi.fn();
    const values: string[] = [];
    const rendered = render(
      <EditorHarness
        initialValue="hi @bo"
        autocompleteOpen
        onEscape={onEscape}
        onValue={(value) => values.push(value)}
      />,
    );

    rendered.stdin.write(KEY.up);
    rendered.stdin.write(KEY.enter);
    rendered.stdin.write(KEY.escape);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(onEscape).not.toHaveBeenCalled();
    expect(values).toHaveLength(0); // no newline inserted, no cursor moved by ↑

    rendered.stdin.write('b');
    expect(values.at(-1)).toBe('hi @bob');
  });

  it('lets interceptPaste swallow a paste instead of inserting it', async () => {
    const values: string[] = [];
    const intercepted: string[] = [];
    const rendered = render(
      <EditorHarness
        initialValue=""
        interceptPaste={(text) => {
          intercepted.push(text);
          return text.startsWith('/');
        }}
        onValue={(value) => values.push(value)}
      />,
    );

    rendered.stdin.write('[200~/home/a/pic.png[201~');
    await settle();
    expect(intercepted).toEqual(['/home/a/pic.png']);
    expect(values).toHaveLength(0);

    rendered.stdin.write('[200~hello[201~');
    await settle();
    expect(values.at(-1)).toBe('hello');
  });
});

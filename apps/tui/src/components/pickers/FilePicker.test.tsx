import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { render } from 'ink-testing-library';
import stringWidth from 'string-width';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FilePicker, type FilePickerProps } from './FilePicker.js';

const KEY = {
  down: '\u001B[B',
  up: '\u001B[A',
  enter: '\r',
  escape: '\u001B',
  tab: '\t',
  backspace: '\u007F',
} as const;

const tempDirectories: string[] = [];
let directory: string;

/**
 * Lets Ink read stdin and commit the resulting state. Writes issued back-to-back with
 * no settle arrive as a *single* chunk, where a lone Escape is swallowed by a following
 * bracketed-paste introducer -- a real terminal always delivers them as separate reads,
 * so tests must too.
 */
async function settle(milliseconds = 30): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function createTempDirectory(): Promise<string> {
  const created = await mkdtemp(join(tmpdir(), 'patches-file-picker-'));
  tempDirectories.push(created);
  return created;
}

function pickerProps(overrides: Partial<FilePickerProps> = {}): FilePickerProps {
  return {
    initialPath: directory,
    allowedExtensions: ['.png'],
    allowedMimeTypes: ['image/png'],
    maxBytes: 32,
    onSelect: vi.fn(),
    onCancel: vi.fn(),
    rows: 9,
    columns: 72,
    ...overrides,
  };
}

function paste(rendered: ReturnType<typeof render>, value: string): void {
  rendered.stdin.write(`\u001B[200~${value}\u001B[201~`);
}

beforeEach(async () => {
  directory = await createTempDirectory();
});

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('FilePicker', () => {
  it('renders directories before files, includes parent, navigates with j/k/arrows, and toggles hidden', async () => {
    await mkdir(join(directory, 'Beta'));
    await mkdir(join(directory, 'alpha'));
    await writeFile(join(directory, 'zeta.png'), 'z');
    await writeFile(join(directory, '.secret.png'), 'secret');
    const rendered = render(<FilePicker {...pickerProps()} />);

    await settle();
    const initial = rendered.lastFrame() ?? '';
    expect(initial).toContain('> ../');
    expect(initial.indexOf('alpha/')).toBeLessThan(initial.indexOf('zeta.png'));
    expect(initial).not.toContain('.secret.png');

    rendered.stdin.write('.');
    await settle();
    expect(rendered.lastFrame()).toContain('hidden on');
    expect(rendered.lastFrame()).toContain('.secret.png');

    rendered.stdin.write('j');
    rendered.stdin.write(KEY.down);
    rendered.stdin.write(KEY.up);
    rendered.stdin.write(KEY.enter);
    await settle();
    expect(rendered.lastFrame()).toContain(`Path: ${join(directory, 'alpha')}`);
    expect(rendered.lastFrame()).toContain('> ../');
  });

  it('completes typed paths with Tab and accepts a decoded file URI paste', async () => {
    const selected = vi.fn();
    const photo = join(directory, 'photo one.png');
    await writeFile(photo, 'png');
    const rendered = render(<FilePicker {...pickerProps({ onSelect: selected })} />);
    await settle();

    paste(rendered, join(directory, 'pho'));
    rendered.stdin.write(KEY.tab);
    await settle();
    expect(rendered.lastFrame()).toContain('photo one.png');

    rendered.stdin.write(KEY.escape);
    await settle();
    paste(rendered, pathToFileURL(photo).href);
    rendered.stdin.write(KEY.enter);
    await settle();
    expect(selected).toHaveBeenCalledWith(photo);
  });

  it('uses Escape to leave path mode before cancelling the whole picker', async () => {
    const onCancel = vi.fn();
    const rendered = render(<FilePicker {...pickerProps({ onCancel })} />);
    await settle();

    rendered.stdin.write(KEY.backspace);
    await settle();
    expect(rendered.lastFrame()).toContain('path entry');
    rendered.stdin.write(KEY.escape);
    await settle(60);
    expect(onCancel).not.toHaveBeenCalled();
    expect(rendered.lastFrame()).toContain('browse');
    rendered.stdin.write(KEY.escape);
    await settle(60);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('shows actionable extension, oversize, and non-regular-file rejection errors', async () => {
    const text = join(directory, 'notes.txt');
    const huge = join(directory, 'huge.png');
    const target = join(directory, 'target.png');
    const link = join(directory, 'linked.png');
    await writeFile(text, 'text');
    await writeFile(huge, 'x'.repeat(40));
    await writeFile(target, 'png');
    await symlink(target, link);
    const onSelect = vi.fn();
    const rendered = render(<FilePicker {...pickerProps({ onSelect })} />);
    await settle();

    paste(rendered, text);
    rendered.stdin.write(KEY.enter);
    await settle();
    expect(rendered.lastFrame()).toContain('Extension .txt is not allowed');

    rendered.stdin.write(KEY.escape);
    await settle();
    paste(rendered, huge);
    rendered.stdin.write(KEY.enter);
    await settle();
    expect(rendered.lastFrame()).toContain('40 bytes; maximum is 32 bytes');

    rendered.stdin.write(KEY.escape);
    await settle();
    paste(rendered, link);
    rendered.stdin.write(KEY.enter);
    await settle();
    expect(rendered.lastFrame()).toContain('not a regular file');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('selects a valid browsed file and never exceeds the fixed rows/columns budget', async () => {
    const selected = vi.fn();
    const photo = join(directory, 'a-very-long-photo-name-that-must-be-clipped.png');
    await writeFile(photo, 'png');
    const rendered = render(
      <FilePicker {...pickerProps({ onSelect: selected, rows: 7, columns: 24 })} />,
    );
    await settle();

    const frame = rendered.lastFrame() ?? '';
    const lines = frame.split('\n');
    expect(lines).toHaveLength(7);
    expect(lines.every((line) => stringWidth(line) <= 24)).toBe(true);

    rendered.stdin.write(KEY.down);
    rendered.stdin.write(KEY.enter);
    await settle();
    expect(selected).toHaveBeenCalledWith(photo);
  });
});

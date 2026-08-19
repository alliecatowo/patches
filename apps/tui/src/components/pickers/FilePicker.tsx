import { constants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';

import { Box, Text, useInput, usePaste, useStdin } from 'ink';
import { useEffect, useRef, useState, type ReactElement } from 'react';

import {
  clipPickerLine,
  completePath,
  completionContext,
  extensionPolicyError,
  filterAndSortEntries,
  inferMimeType,
  mimePolicyError,
  resolvePathInput,
  type FilePickerEntry,
} from './file-picker-model.js';

type PickerMode = 'browse' | 'path';

interface BrowserEntry extends FilePickerEntry {
  path: string;
  parent?: true;
}

export interface FilePickerProps {
  initialPath: string;
  allowedExtensions?: readonly string[];
  allowedMimeTypes?: readonly string[];
  /** Optional caller-owned MIME detector; useful when extension inference is insufficient. */
  resolveMimeType?: ((path: string) => string | undefined | Promise<string | undefined>) | undefined;
  /** Extra extension-to-MIME mappings, used only when `resolveMimeType` is absent. */
  mimeTypesByExtension?: Readonly<Record<string, string>>;
  maxBytes: number;
  onSelect: (path: string) => void;
  onCancel: () => void;
  /** Exact terminal-cell rectangle. Output is always clipped to these dimensions. */
  rows: number;
  columns: number;
  showHiddenInitially?: boolean;
  isActive?: boolean;
  workingDirectory?: string;
  homeDirectory?: string;
}

/** Fixed-size, keyboard-first local file browser and safe path-completion input. */
export function FilePicker({
  initialPath,
  allowedExtensions = [],
  allowedMimeTypes = [],
  resolveMimeType: resolveMimeTypeFromCaller,
  mimeTypesByExtension = {},
  maxBytes,
  onSelect,
  onCancel,
  rows,
  columns,
  showHiddenInitially = false,
  isActive = true,
  workingDirectory = process.cwd(),
  homeDirectory = homedir(),
}: FilePickerProps): ReactElement {
  const { isRawModeSupported } = useStdin();
  const fallbackDirectory = resolve(workingDirectory);
  const [directory, setDirectory] = useState(fallbackDirectory);
  const [pathInput, setPathInput] = useState(initialPath);
  const [mode, setMode] = useState<PickerMode>('browse');
  const [entries, setEntries] = useState<BrowserEntry[]>([]);
  const [selected, setSelected] = useState(0);
  const [showHidden, setShowHidden] = useState(showHiddenInitially);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const directoryRef = useRef(directory);
  const inputRef = useRef(pathInput);
  const modeRef = useRef<PickerMode>(mode);
  const entriesRef = useRef<BrowserEntry[]>(entries);
  const selectedRef = useRef(selected);
  const showHiddenRef = useRef(showHidden);
  const loadRequestRef = useRef(0);
  const completionRequestRef = useRef(0);
  const initialRequestRef = useRef(0);

  useEffect(() => {
    showHiddenRef.current = showHidden;
  }, [showHidden]);

  useEffect(() => {
    const request = ++initialRequestRef.current;

    // State is only ever published from inside this async callback, never synchronously
    // from the effect body, so resolving a path can't cascade renders (react-hooks/set-state-in-effect).
    const initialize = async (): Promise<void> => {
      const parsed = resolvePathInput(initialPath, workingDirectory, homeDirectory);
      if (!parsed.ok) {
        await Promise.resolve();
        if (initialRequestRef.current !== request) return;
        setError(parsed.error);
        setLoading(false);
        return;
      }
      let nextDirectory = dirname(parsed.path);
      try {
        const stats = await lstat(parsed.path);
        if (stats.isDirectory()) nextDirectory = parsed.path;
      } catch {
        // A partial/nonexistent initial filename still browses from its existing parent.
      }
      if (initialRequestRef.current !== request) return;
      const resolvedDirectory = resolve(nextDirectory);
      directoryRef.current = resolvedDirectory;
      inputRef.current = parsed.path;
      setDirectory(resolvedDirectory);
      setPathInput(parsed.path);
    };
    void initialize();
    return () => {
      initialRequestRef.current += 1;
    };
  }, [homeDirectory, initialPath, workingDirectory]);

  useEffect(() => {
    const request = ++loadRequestRef.current;
    const load = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const dirents = await readdir(directory, { withFileTypes: true });
        const sorted = filterAndSortEntries(
          dirents.map((entry) => ({
            name: entry.name,
            kind: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
          })),
          showHidden,
        );
        if (loadRequestRef.current !== request) return;
        const nextEntries: BrowserEntry[] = [
          { name: '..', kind: 'directory', path: dirname(directory), parent: true },
          ...sorted.map((entry) => ({ ...entry, path: join(directory, entry.name) })),
        ];
        entriesRef.current = nextEntries;
        selectedRef.current = 0;
        setEntries(nextEntries);
        setSelected(0);
        setLoading(false);
      } catch (caught) {
        if (loadRequestRef.current !== request) return;
        entriesRef.current = [];
        setEntries([]);
        setLoading(false);
        setError(readableFsError('Cannot open directory', caught));
      }
    };
    void load();
    return () => {
      loadRequestRef.current += 1;
    };
  }, [directory, showHidden]);

  const enterPathMode = (nextInput: string): void => {
    modeRef.current = 'path';
    inputRef.current = nextInput;
    setMode('path');
    setPathInput(nextInput);
    setError(null);
  };

  const changeDirectory = (nextDirectory: string): void => {
    const resolvedDirectory = resolve(nextDirectory);
    directoryRef.current = resolvedDirectory;
    inputRef.current = `${resolvedDirectory}${resolvedDirectory.endsWith(sep) ? '' : sep}`;
    modeRef.current = 'browse';
    setDirectory(resolvedDirectory);
    setPathInput(inputRef.current);
    setMode('browse');
    setError(null);
  };

  const selectFile = async (path: string): Promise<void> => {
    setError(null);
    const validationError = await validateSelectedFile(path, {
      allowedExtensions,
      allowedMimeTypes,
      maxBytes,
      mimeTypesByExtension,
      resolveMimeType: resolveMimeTypeFromCaller,
    });
    if (validationError !== null) {
      setError(validationError);
      return;
    }
    onSelect(path);
  };

  const enterPath = async (): Promise<void> => {
    const parsed = resolvePathInput(inputRef.current, workingDirectory, homeDirectory);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    try {
      const stats = await lstat(parsed.path);
      if (stats.isDirectory()) {
        changeDirectory(parsed.path);
        return;
      }
      await selectFile(parsed.path);
    } catch (caught) {
      setError(readableFsError('Path does not exist or cannot be inspected', caught));
    }
  };

  const activateSelected = (): void => {
    const entry = entriesRef.current[selectedRef.current];
    if (entry === undefined) return;
    if (entry.kind === 'directory') changeDirectory(entry.path);
    else void selectFile(entry.path);
  };

  const moveSelection = (delta: number): void => {
    const count = entriesRef.current.length;
    if (count === 0) return;
    const next = (selectedRef.current + delta + count) % count;
    selectedRef.current = next;
    setSelected(next);
  };

  const completeInput = (): void => {
    const request = ++completionRequestRef.current;
    const context = completionContext(inputRef.current, workingDirectory, homeDirectory);
    if ('ok' in context) {
      setError(context.error);
      return;
    }
    const complete = async (): Promise<void> => {
      try {
        const dirents = await readdir(context.directory, { withFileTypes: true });
        const candidates = filterAndSortEntries(
          dirents.map((entry) => ({
            name: entry.name,
            kind: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
          })),
          showHiddenRef.current,
        );
        if (completionRequestRef.current !== request) return;
        const completion = completePath(context, candidates);
        enterPathMode(completion.value);
        if (completion.matchCount === 0) setError('No path completion matches.');
        else if (completion.matchCount > 1) {
          setError(`${String(completion.matchCount)} matches; type another character.`);
        }
      } catch (caught) {
        if (completionRequestRef.current !== request) return;
        setError(readableFsError('Cannot complete path', caught));
      }
    };
    void complete();
  };

  useInput(
    (input, key) => {
      if (key.eventType === 'release') return;
      if (key.escape) {
        if (modeRef.current === 'path') {
          modeRef.current = 'browse';
          inputRef.current = `${directoryRef.current}${directoryRef.current.endsWith(sep) ? '' : sep}`;
          setMode('browse');
          setPathInput(inputRef.current);
          setError(null);
        } else onCancel();
        return;
      }
      if (key.tab) {
        completeInput();
        return;
      }
      if (key.return) {
        if (modeRef.current === 'path') void enterPath();
        else activateSelected();
        return;
      }
      if (key.backspace || key.delete) {
        enterPathMode(inputRef.current.slice(0, -1));
        return;
      }
      if (modeRef.current === 'browse' && (key.upArrow || input === 'k')) {
        moveSelection(-1);
        return;
      }
      if (modeRef.current === 'browse' && (key.downArrow || input === 'j')) {
        moveSelection(1);
        return;
      }
      if (modeRef.current === 'browse' && input === '.') {
        const next = !showHiddenRef.current;
        showHiddenRef.current = next;
        setShowHidden(next);
        return;
      }
      if (key.ctrl && input.toLowerCase() === 'u') {
        enterPathMode('');
        return;
      }
      if (!key.ctrl && !key.meta && input !== '') {
        if (input.includes('\0')) {
          setError('Paths cannot contain a NUL byte.');
          return;
        }
        enterPathMode(`${inputRef.current}${input}`);
      }
    },
    { isActive: isActive && isRawModeSupported },
  );

  usePaste(
    (pasted) => {
      if (pasted.includes('\0')) {
        setError('Paths cannot contain a NUL byte.');
        return;
      }
      const normalized = pasted.replace(/(?:\r\n|\r|\n)$/u, '');
      enterPathMode(modeRef.current === 'browse' ? normalized : `${inputRef.current}${normalized}`);
    },
    { isActive: isActive && isRawModeSupported },
  );

  const height = Math.max(1, Math.trunc(rows));
  const width = Math.max(1, Math.trunc(columns));
  const listRows = Math.max(0, height - 4);
  const start = Math.min(
    Math.max(0, selected - listRows + 1),
    Math.max(0, entries.length - listRows),
  );
  const visibleEntries = entries.slice(start, start + listRows);
  const status =
    error ?? (loading ? 'Loading directory…' : `${String(Math.max(0, entries.length - 1))} items`);
  const lines = [
    `File picker · ${mode === 'path' ? 'path entry' : 'browse'} · hidden ${showHidden ? 'on' : 'off'}`,
    `Path: ${pathInput}`,
    ...visibleEntries.map((entry, index) => {
      const absoluteIndex = start + index;
      const suffix = entry.kind === 'directory' ? sep : '';
      return `${absoluteIndex === selected ? '>' : ' '} ${entry.name}${suffix}`;
    }),
    error === null ? status : `Error: ${status}`,
    mode === 'path'
      ? 'Tab complete · Enter open/select · Esc browse · Backspace edit'
      : 'Arrows/j/k move · Enter open/select · . hidden · Esc cancel',
  ];
  const fixedLines = lines.slice(0, height);
  while (fixedLines.length < height) fixedLines.push(' ');

  return (
    <Box
      aria-label="File picker"
      flexDirection="column"
      flexShrink={0}
      height={height}
      width={width}
      overflow="hidden"
    >
      {fixedLines.map((line, index) => (
        <Box flexShrink={0} height={1} width={width} overflow="hidden" key={String(index)}>
          <Text>{clipPickerLine(line, width)}</Text>
        </Box>
      ))}
    </Box>
  );
}

interface ValidationOptions {
  allowedExtensions: readonly string[];
  allowedMimeTypes: readonly string[];
  maxBytes: number;
  mimeTypesByExtension: Readonly<Record<string, string>>;
  resolveMimeType?: ((path: string) => string | undefined | Promise<string | undefined>) | undefined;
}

async function validateSelectedFile(
  path: string,
  options: ValidationOptions,
): Promise<string | null> {
  if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 0) {
    return 'The caller provided an invalid maximum file size.';
  }

  try {
    const beforeOpen = await lstat(path);
    if (!beforeOpen.isFile()) return 'Selection is not a regular file (links are not followed).';

    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stats = await handle.stat();
      if (!stats.isFile()) return 'Selection is not a regular file.';
      if (stats.size > options.maxBytes) {
        return `File is ${String(stats.size)} bytes; maximum is ${String(options.maxBytes)} bytes.`;
      }
    } finally {
      await handle.close();
    }
  } catch (caught) {
    return readableFsError('File is not readable', caught);
  }

  const extensionError = extensionPolicyError(path, options.allowedExtensions);
  if (extensionError !== null) return extensionError;

  let mimeType: string | undefined;
  try {
    mimeType = options.resolveMimeType
      ? await options.resolveMimeType(path)
      : inferMimeType(path, options.mimeTypesByExtension);
  } catch (caught) {
    return readableFsError('MIME type detection failed', caught);
  }
  return mimePolicyError(mimeType, options.allowedMimeTypes);
}

function readableFsError(prefix: string, caught: unknown): string {
  if (
    typeof caught === 'object' &&
    caught !== null &&
    'code' in caught &&
    typeof caught.code === 'string'
  ) {
    return `${prefix} (${caught.code}).`;
  }
  return `${prefix}.`;
}

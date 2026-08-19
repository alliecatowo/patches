import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import stringWidth from 'string-width';

export type FilePickerEntryKind = 'directory' | 'file';

export interface FilePickerEntryCandidate {
  name: string;
  kind: FilePickerEntryKind | 'other';
}

export interface FilePickerEntry {
  name: string;
  kind: FilePickerEntryKind;
}

export interface ParsedPath {
  ok: true;
  path: string;
}

export interface PathParseFailure {
  ok: false;
  error: string;
}

export type PathParseResult = ParsedPath | PathParseFailure;

export interface CompletionContext {
  directory: string;
  fragment: string;
}

export interface PathCompletion {
  value: string;
  matchCount: number;
}

const DEFAULT_MIME_TYPES: Readonly<Record<string, string>> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.txt': 'text/plain',
  '.pdf': 'application/pdf',
};

/** Parse only the two path conveniences the picker promises: leading `~/` and `file://`. */
export function parsePathInput(input: string, homeDirectory: string): PathParseResult {
  if (input.includes('\0')) return { ok: false, error: 'Paths cannot contain a NUL byte.' };

  if (/^file:/i.test(input)) {
    if (!/^file:\/\//i.test(input)) {
      return { ok: false, error: 'File URIs must begin with file://.' };
    }
    try {
      const url = new URL(input);
      if (url.protocol !== 'file:') return { ok: false, error: 'Only file:// URIs are accepted.' };
      if (url.search !== '' || url.hash !== '') {
        return { ok: false, error: 'File URIs cannot contain a query or fragment.' };
      }
      return { ok: true, path: fileURLToPath(url) };
    } catch {
      return { ok: false, error: 'That file:// URI is not valid.' };
    }
  }

  if (input.startsWith('~/')) return { ok: true, path: join(homeDirectory, input.slice(2)) };
  return { ok: true, path: input };
}

export function resolvePathInput(
  input: string,
  workingDirectory: string,
  homeDirectory: string,
): PathParseResult {
  const parsed = parsePathInput(input, homeDirectory);
  if (!parsed.ok) return parsed;
  return { ok: true, path: resolve(workingDirectory, parsed.path) };
}

/** Keep only browsable entries, hide dotfiles by default, then sort dirs first and names stably. */
export function filterAndSortEntries(
  entries: readonly FilePickerEntryCandidate[],
  showHidden: boolean,
): FilePickerEntry[] {
  return entries
    .filter(
      (entry): entry is FilePickerEntry =>
        (entry.kind === 'directory' || entry.kind === 'file') &&
        (showHidden || !entry.name.startsWith('.')),
    )
    .sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1;
      const foldedLeft = left.name.toLowerCase();
      const foldedRight = right.name.toLowerCase();
      if (foldedLeft < foldedRight) return -1;
      if (foldedLeft > foldedRight) return 1;
      if (left.name < right.name) return -1;
      if (left.name > right.name) return 1;
      return 0;
    });
}

export function completionContext(
  input: string,
  workingDirectory: string,
  homeDirectory: string,
): CompletionContext | PathParseFailure {
  const parsed = resolvePathInput(input, workingDirectory, homeDirectory);
  if (!parsed.ok) return parsed;
  const endsWithSeparator = parsed.path.endsWith(sep);
  return {
    directory: endsWithSeparator ? parsed.path : dirname(parsed.path),
    fragment: endsWithSeparator ? '' : basename(parsed.path),
  };
}

export function completePath(
  context: CompletionContext,
  entries: readonly FilePickerEntry[],
): PathCompletion {
  const foldedFragment = context.fragment.toLowerCase();
  const matches = entries.filter((entry) => entry.name.toLowerCase().startsWith(foldedFragment));
  if (matches.length === 0)
    return { value: join(context.directory, context.fragment), matchCount: 0 };

  if (matches.length === 1) {
    const match = matches[0];
    if (match === undefined)
      return { value: join(context.directory, context.fragment), matchCount: 0 };
    const completed = join(context.directory, match.name);
    return {
      value: match.kind === 'directory' ? `${completed}${sep}` : completed,
      matchCount: 1,
    };
  }

  const common = commonCaseInsensitivePrefix(matches.map((entry) => entry.name));
  return {
    value: join(
      context.directory,
      common.length >= context.fragment.length ? common : context.fragment,
    ),
    matchCount: matches.length,
  };
}

export function normalizeAllowedExtensions(extensions: readonly string[]): string[] {
  return [
    ...new Set(
      extensions.map((extension) => {
        const folded = extension.toLowerCase();
        return folded.startsWith('.') ? folded : `.${folded}`;
      }),
    ),
  ];
}

export function inferMimeType(
  path: string,
  overrides: Readonly<Record<string, string>> = {},
): string | undefined {
  const extension = extname(path).toLowerCase();
  const override = Object.entries(overrides).find(
    ([candidate]) => normalizeAllowedExtensions([candidate])[0] === extension,
  );
  return override?.[1] ?? DEFAULT_MIME_TYPES[extension];
}

export function extensionPolicyError(
  path: string,
  allowedExtensions: readonly string[],
): string | null {
  if (allowedExtensions.length === 0) return null;
  const allowed = normalizeAllowedExtensions(allowedExtensions);
  const extension = extname(path).toLowerCase();
  if (allowed.includes(extension)) return null;
  const shown = extension === '' ? 'no extension' : extension;
  return `Extension ${shown} is not allowed. Allowed: ${allowed.join(', ')}.`;
}

export function mimePolicyError(
  mimeType: string | undefined,
  allowedMimeTypes: readonly string[],
): string | null {
  if (allowedMimeTypes.length === 0) return null;
  if (mimeType === undefined) return 'MIME type could not be determined for this file.';
  const foldedMime = mimeType.toLowerCase();
  const accepted = allowedMimeTypes.some((allowed) => {
    const foldedAllowed = allowed.toLowerCase();
    return foldedAllowed.endsWith('/*')
      ? foldedMime.startsWith(foldedAllowed.slice(0, -1))
      : foldedMime === foldedAllowed;
  });
  return accepted
    ? null
    : `MIME type ${mimeType} is not allowed. Allowed: ${allowedMimeTypes.join(', ')}.`;
}

/** Replace terminal controls visibly so hostile local filenames cannot emit escape sequences. */
export function sanitizePickerLine(value: string): string {
  let result = '';
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    const isControl = codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
    result += isControl ? (codePoint === 0x09 ? ' ' : '?') : character;
  }
  return result;
}

/** Hard clip to terminal cells, including the ellipsis when content was removed. */
export function clipPickerLine(value: string, columns: number): string {
  const safe = sanitizePickerLine(value);
  const width = Math.max(0, Math.trunc(columns));
  if (width === 0) return '';
  if (stringWidth(safe) <= width) return safe;
  if (width === 1) return '…';
  let clipped = '';
  for (const character of safe) {
    if (stringWidth(`${clipped}${character}`) > width - 1) break;
    clipped += character;
  }
  return `${clipped}…`;
}

function commonCaseInsensitivePrefix(values: readonly string[]): string {
  const first = values[0] ?? '';
  let length = first.length;
  for (const value of values.slice(1)) {
    const foldedFirst = first.toLowerCase();
    const foldedValue = value.toLowerCase();
    let index = 0;
    while (
      index < length &&
      index < foldedValue.length &&
      foldedFirst[index] === foldedValue[index]
    ) {
      index += 1;
    }
    length = index;
  }
  return first.slice(0, length);
}

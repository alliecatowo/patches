import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

/** Mirrors `readLocalImage`'s supported extensions (spec §28) — this is only a
 * heuristic gate for "does this paste look like an image path" versus "is this
 * pasted prose"; the real format check is `readLocalImage`'s magic-byte sniff. */
const IMAGE_EXTENSION = /\.(?:jpe?g|png|webp)$/iu;

interface UnquoteResult {
  value: string;
  wasQuoted: boolean;
}

function unquote(line: string): UnquoteResult {
  if (line.length >= 2) {
    const first = line[0];
    const last = line[line.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return { value: line.slice(1, -1), wasQuoted: true };
    }
  }
  return { value: line, wasQuoted: false };
}

/** Decodes a `file://` URI to a filesystem path, `null` if it isn't one or is
 * malformed — never `decodeURIComponent`s or resolves anything else as a URI. */
function decodeFileUri(value: string): { path: string; wasFileUri: boolean } | null {
  if (!value.startsWith('file://')) return { path: value, wasFileUri: false };
  try {
    const url = new URL(value);
    if (url.protocol !== 'file:') return null;
    return { path: decodeURIComponent(url.pathname), wasFileUri: true };
  } catch {
    return null;
  }
}

function expandHome(path: string): string {
  if (path === '~') return homedir();
  if (path.startsWith('~/')) return join(homedir(), path.slice(2));
  return path;
}

/** One pasted line, if and only if it unambiguously names a local image path. */
function attachablePath(line: string): string | null {
  if (line === '' || line.includes('\0')) return null;
  const { value: unquoted, wasQuoted } = unquote(line);
  if (unquoted === '') return null;
  const decoded = decodeFileUri(unquoted);
  if (decoded === null) return null;
  const expanded = expandHome(decoded.path);

  // A bare, unquoted line with internal whitespace reads as pasted prose, not a
  // path — quoting or a `file://` URI is what disambiguates a path with spaces in
  // it, same as a shell would require.
  if (!wasQuoted && !decoded.wasFileUri && /\s/u.test(expanded)) return null;
  if (!isAbsolute(expanded)) return null;
  if (!IMAGE_EXTENSION.test(expanded)) return null;
  return expanded;
}

/**
 * Detects a bracketed paste that names one or more local image files — a bare
 * absolute path, a `file://` URI, a quoted path, or several of those on separate
 * lines (a multi-file drag/drop most terminals deliver as bracketed-paste text,
 * P12-111). Returns `null` for anything that isn't unambiguously a full list of
 * paths, so ordinary text (a URL, a quote, prose that merely contains a `/`)
 * always still lands in the editor as text. Never interpolates a path into a
 * shell — the caller passes each result straight to `readLocalImage`'s own
 * `readFile`.
 */
export function detectPastedImagePaths(pastedText: string): string[] | null {
  const lines = pastedText
    .split(/\r\n|\r|\n/u)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  if (lines.length === 0) return null;

  const paths: string[] = [];
  for (const line of lines) {
    const path = attachablePath(line);
    if (path === null) return null;
    paths.push(path);
  }
  return paths;
}

import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const queues = new Map<string, Promise<void>>();

/**
 * Writes `contents` to `path` via temp file + rename, so a crash or a racing reader
 * sees the old file or the new one, never a truncated document. Writes to the same
 * path are serialised so a slow older write cannot land after a newer one.
 */
export function writeFileAtomic(
  path: string,
  contents: string,
  options: { mode?: number; dirMode?: number } = {},
): Promise<void> {
  const previous = queues.get(path) ?? Promise.resolve();
  const run = previous
    .catch(() => undefined)
    .then(async () => {
      await mkdir(dirname(path), {
        recursive: true,
        ...(options.dirMode === undefined ? {} : { mode: options.dirMode }),
      });
      const temporary = `${path}.${String(process.pid)}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, contents, {
          encoding: 'utf8',
          ...(options.mode === undefined ? {} : { mode: options.mode }),
        });
        if (options.mode !== undefined) await chmod(temporary, options.mode);
        await rename(temporary, path);
      } catch (error) {
        await rm(temporary, { force: true });
        throw error;
      }
    });
  const tail = run.catch(() => undefined);
  queues.set(path, tail);
  void tail.then(() => {
    if (queues.get(path) === tail) queues.delete(path);
  });
  return run;
}

/** Moves an unreadable file aside so the next launch starts clean; best-effort. */
export async function quarantineFile(path: string): Promise<void> {
  try {
    await rename(path, `${path}.corrupt-${String(Date.now())}`);
  } catch {
    // Nothing more to do: the caller already treats the file as absent.
  }
}

/**
 * Reads and parses JSON. A missing file or a corrupt/truncated one yields `fallback`
 * (the corrupt file is quarantined) instead of rejecting — a half-written state file must
 * never stop the app from launching.
 */
export async function readJsonOr<T>(path: string, fallback: T): Promise<T> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    await quarantineFile(path);
    return fallback;
  }
}

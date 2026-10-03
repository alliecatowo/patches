import { mkdir, readdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Bounded on-disk LRU cache for downloaded media (spec §32: "The TUI should cache
 * downloaded media locally … Implement a bounded LRU-style cache. Do not allow
 * unlimited disk growth.").
 *
 * One file per `(mediaId, variant)` pair, named so a directory listing alone tells you
 * what is cached. Recency is tracked with the filesystem's own mtime/atime (`utimes` on
 * every hit) rather than a separate manifest file — one less thing that can go out of
 * sync with the directory it describes.
 */
export interface MediaCacheOptions {
  /** Overridden in tests. Default: `$XDG_CACHE_HOME/patches/media`, falling back to
   * `~/.cache/patches/media` (spec §32). */
  dir?: string;
  /** Total bytes the cache may occupy before the least-recently-used entries are
   * evicted. Default 100 MB — generous for a few hundred display-size JPEGs/PNGs
   * (spec §28's 10 MB per-upload ceiling), small enough not to surprise anyone. */
  maxBytes?: number;
}

export interface CachedMedia {
  bytes: Uint8Array;
  /** Local file path — reused by `o` (open externally) so the OS opener has a real
   * file with the right extension rather than a URL. */
  path: string;
}

const DEFAULT_MAX_BYTES = 100 * 1024 * 1024; // 100 MB

function defaultCacheDir(): string {
  const xdg = process.env.XDG_CACHE_HOME;
  const base = xdg !== undefined && xdg.trim() !== '' ? xdg : join(homedir(), '.cache');
  return join(base, 'patches', 'media');
}

function extensionFor(mime: string): string {
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  return '.jpg';
}

/** File-system-safe: media ids are UUIDs and variants are our own fixed strings, but
 * this stays defensive rather than trusting that. */
function safeSegment(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9_-]/g, '_');
}

export class MediaCache {
  private readonly dir: string;
  private readonly maxBytes: number;

  constructor(options: MediaCacheOptions = {}) {
    this.dir = options.dir ?? defaultCacheDir();
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  }

  pathFor(mediaId: string, variant: string, mime: string): string {
    return join(this.dir, `${safeSegment(mediaId)}.${safeSegment(variant)}${extensionFor(mime)}`);
  }

  async get(mediaId: string, variant: string, mime: string): Promise<CachedMedia | undefined> {
    const path = this.pathFor(mediaId, variant, mime);
    try {
      const bytes = await readFile(path);
      const now = new Date();
      // Best-effort recency touch — a failure here (e.g. a read-only mount) should
      // never turn a cache hit into an error.
      await utimes(path, now, now).catch(() => undefined);
      return { bytes, path };
    } catch {
      return undefined;
    }
  }

  async put(
    mediaId: string,
    variant: string,
    mime: string,
    bytes: Uint8Array,
  ): Promise<CachedMedia> {
    await mkdir(this.dir, { recursive: true });
    const path = this.pathFor(mediaId, variant, mime);
    await writeFile(path, bytes);
    await this.evict();
    return { bytes, path };
  }

  /** Cache-through: returns the cached copy if one exists, otherwise calls `fetchBytes`,
   * writes the result into the cache, and returns that. */
  async getOrFetch(
    mediaId: string,
    variant: string,
    mime: string,
    fetchBytes: () => Promise<Uint8Array>,
  ): Promise<CachedMedia> {
    const cached = await this.get(mediaId, variant, mime);
    if (cached !== undefined) return cached;
    const bytes = await fetchBytes();
    return this.put(mediaId, variant, mime, bytes);
  }

  /** Evicts least-recently-used files until the directory is back under `maxBytes`.
   * Best-effort throughout: a cache that fails to evict should degrade to "grows a bit
   * larger than intended", never to a crash. */
  private async evict(): Promise<void> {
    let names: string[];
    try {
      names = await readdir(this.dir);
    } catch {
      return;
    }

    const entries: { path: string; size: number; atimeMs: number }[] = [];
    for (const name of names) {
      const path = join(this.dir, name);
      try {
        const info = await stat(path);
        if (info.isFile()) entries.push({ path, size: info.size, atimeMs: info.atimeMs });
      } catch {
        // Vanished between readdir and stat (e.g. a concurrent eviction) — skip it.
      }
    }

    let total = entries.reduce((sum, entry) => sum + entry.size, 0);
    if (total <= this.maxBytes) return;

    entries.sort((a, b) => a.atimeMs - b.atimeMs);
    for (const entry of entries) {
      if (total <= this.maxBytes) break;
      try {
        await rm(entry.path, { force: true });
        total -= entry.size;
      } catch {
        // Best-effort — move on to the next-oldest entry.
      }
    }
  }
}

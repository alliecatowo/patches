import { spawn } from 'node:child_process';

import { MEDIA_STATUS, type MediaAttachment } from '@patches/proto';

import type { PatchesApi } from '../api/client.js';
import type { MediaCache } from './cache.js';

/** Argument-array spawn only (spec §76: "Never interpolate untrusted file paths into a
 * shell string. Use argument arrays / no-shell process execution."). Injectable so
 * tests can record the call instead of actually launching anything. */
export type SpawnFn = (command: string, args: readonly string[]) => void;

export interface OpenMediaOptions {
  env?: NodeJS.ProcessEnv;
  spawnFn?: SpawnFn;
  platform?: NodeJS.Platform;
}

/** Exported for `pages/open-link.ts` — the same `PATCHES_NO_OPEN` test/CI escape
 * hatch applies to opening a page `Link` externally. */
export function isTruthyEnv(value: string | undefined): boolean {
  return value !== undefined && value !== '' && value !== '0' && value.toLowerCase() !== 'false';
}

/** Exported for `pages/open-link.ts` — the real (non-test) `SpawnFn` implementation. */
export function realSpawn(command: string, args: readonly string[]): void {
  const child = spawn(command, [...args], { detached: true, stdio: 'ignore' });
  // No OS opener configured (common in headless/CI shells) is not this code's problem
  // to report — the fallback box already told the user "press o to open externally".
  child.on('error', () => undefined);
  child.unref();
}

/** Exported for `pages/open-link.ts` (P45-004/006's "Enter opens a page Link
 * externally") — the OS-opener command mapping is the same regardless of whether the
 * target is a cached local file or a `http(s)` URL. */
export function openerCommand(platform: NodeJS.Platform, path: string): [string, string[]] {
  if (platform === 'darwin') return ['open', [path]];
  if (platform === 'win32') return ['cmd', ['/c', 'start', '', path]];
  return ['xdg-open', [path]];
}

/**
 * `o` (spec §76): downloads the given attachment's display derivative into the shared
 * media cache and opens the cached file with the OS default handler — a real local
 * file with the right extension, not a URL, so the OS picks an image viewer rather
 * than a browser.
 */
export async function openMediaExternally(
  api: PatchesApi,
  cache: MediaCache,
  attachment: MediaAttachment,
  ensureAccessToken: () => Promise<string>,
  options: OpenMediaOptions = {},
): Promise<void> {
  const env = options.env ?? process.env;
  // Escape hatch for headless/CI shells with no OS opener at all — resolves rather
  // than throwing, so callers can't mistake "skipped" for "failed".
  if (isTruthyEnv(env.PATCHES_NO_OPEN)) return;

  const accessToken = await ensureAccessToken();
  const download = await api.getMediaDownload({ mediaId: attachment.mediaId }, accessToken);
  if (download.status !== MEDIA_STATUS.READY || download.downloadUrl === '') {
    throw new Error('This image is still processing.');
  }
  const mime = download.mimeType !== '' ? download.mimeType : attachment.mimeType;
  const { path } = await cache.getOrFetch(attachment.mediaId, 'display', mime, () =>
    fetchBytes(download.downloadUrl),
  );

  const spawnFn = options.spawnFn ?? realSpawn;
  const [command, args] = openerCommand(options.platform ?? process.platform, path);
  spawnFn(command, args);
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Media download failed (HTTP ${String(response.status)}).`);
  return new Uint8Array(await response.arrayBuffer());
}

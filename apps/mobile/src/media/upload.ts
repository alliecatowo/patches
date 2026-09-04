import * as Crypto from 'expo-crypto';
import { MediaStatus, type GetMediaDownloadResponse } from '@patches/proto/es';
import type { PatchesApi } from '@patches/client';

import { safePageHref } from '../pages/href.js';

/** `PatchesApi['media']` — the generated `MediaService` client, not re-derived from
 * `@connectrpc/connect`'s `Client<T>` so this module stays agnostic of that import path. */
type MediaClient = PatchesApi['media'];

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Client-computed SHA-256 of the raw image bytes (spec §31), verified against the
 * uploaded object by the worker before the media is marked `READY`. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
  return bytesToHex(new Uint8Array(digest));
}

export interface LocalImage {
  bytes: Uint8Array;
  mimeType: string;
}

export interface UploadProgress {
  sentBytes: number;
  totalBytes: number;
}

/**
 * `BeginMediaUpload` -> direct PUT to R2 -> `FinalizeMediaUpload` (spec §30, §101, §153 —
 * image bytes never proxy through the Node app server). RN's `fetch` cannot stream a
 * request body (`docs/research/expo-react-native.md` §3), but a single `Uint8Array` PUT
 * body is a normal, non-streaming request and is unaffected by that limitation — only
 * Connect's own RPC transport is streaming-restricted here.
 */
export async function uploadMediaBytes(
  media: MediaClient,
  local: LocalImage,
  onProgress?: (progress: UploadProgress) => void,
): Promise<string> {
  const totalBytes = local.bytes.byteLength;
  const sha256 = await sha256Hex(local.bytes);
  const begin = await media.beginMediaUpload({
    mimeType: local.mimeType,
    byteSize: BigInt(totalBytes),
    sha256,
  });

  onProgress?.({ sentBytes: 0, totalBytes });
  const response = await fetch(begin.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': local.mimeType },
    body: local.bytes,
  });
  if (!response.ok) {
    throw new Error(`Upload failed (HTTP ${String(response.status)}).`);
  }
  onProgress?.({ sentBytes: totalBytes, totalBytes });

  await media.finalizeMediaUpload({ mediaId: begin.mediaId });
  return begin.mediaId;
}

export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Polls `GetMediaDownload` until the worker reports `READY`/`FAILED`, or `timeoutMs`
 * elapses — whichever first. Never throws on timeout; the caller decides what "still
 * processing" means for its UI (mirrors `apps/tui/src/media/upload.ts`). */
export async function pollMediaUntilReady(
  media: MediaClient,
  mediaId: string,
  options: PollOptions = {},
): Promise<GetMediaDownloadResponse> {
  const intervalMs = options.intervalMs ?? 500;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const response = await media.getMediaDownload({ mediaId });
    if (response.status === MediaStatus.READY || response.status === MediaStatus.FAILED) {
      return response;
    }
    if (Date.now() >= deadline) return response;
    await sleep(intervalMs);
  }
}

/** Resolves a media ID to its safe download URL via `GetMediaDownload` and `safePageHref`.
 * Returns `null` if fetching fails or if the download URL is not a safe http(s) URL. */
export async function resolveMediaDownloadUrl(
  media: MediaClient,
  mediaId: string,
): Promise<string | null> {
  try {
    const response = await media.getMediaDownload({ mediaId });
    if (!response.downloadUrl) return null;
    return safePageHref(response.downloadUrl);
  } catch {
    return null;
  }
}

import { MEDIA_STATUS } from '../api/wire/enums.js';
import type { GetMediaDownloadResponse } from '../api/wire/types.js';

import type { PatchesApi } from '../api/client.js';
import type { LocalImage } from './validate.js';

export interface UploadProgress {
  sentBytes: number;
  totalBytes: number;
}

const UPLOAD_CHUNK_BYTES = 64 * 1024;

/**
 * PUTs `local.bytes` to `uploadUrl` in chunks, reporting progress after each one
 * (spec §139: "upload progress"). The presigned URL pins `Content-Type`/expected size
 * (spec §30), so both headers are sent exactly as the server computed them from
 * `BeginMediaUpload` — never re-derived here.
 */
export async function putToPresignedUrl(
  uploadUrl: string,
  local: Pick<LocalImage, 'bytes' | 'mimeType'>,
  onProgress?: (progress: UploadProgress) => void,
): Promise<void> {
  const total = local.bytes.byteLength;
  let sent = 0;
  onProgress?.({ sentBytes: 0, totalBytes: total });

  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= total) {
        controller.close();
        return;
      }
      const end = Math.min(sent + UPLOAD_CHUNK_BYTES, total);
      controller.enqueue(local.bytes.subarray(sent, end));
      sent = end;
      onProgress?.({ sentBytes: sent, totalBytes: total });
    },
  });

  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': local.mimeType, 'Content-Length': String(total) },
    body,
    duplex: 'half',
  });

  if (!response.ok) {
    throw new Error(`Upload failed (HTTP ${String(response.status)}).`);
  }
}

export interface UploadMediaResult {
  mediaId: string;
}

/** `BeginMediaUpload` -> direct PUT to R2 -> `FinalizeMediaUpload` (spec §30). Returns
 * as soon as the object is finalized server-side — the caller polls
 * `GetMediaDownload`/`pollUntilReady` separately for the worker's PROCESSING -> READY
 * transition, since finalize only queues that work. */
export async function uploadMediaFile(
  api: PatchesApi,
  accessToken: string,
  local: LocalImage,
  onProgress?: (progress: UploadProgress) => void,
): Promise<UploadMediaResult> {
  const begin = await api.beginMediaUpload(
    { mimeType: local.mimeType, byteSize: String(local.byteSize), sha256: local.sha256 },
    accessToken,
  );
  await putToPresignedUrl(begin.uploadUrl, local, onProgress);
  await api.finalizeMediaUpload({ mediaId: begin.mediaId }, accessToken);
  return { mediaId: begin.mediaId };
}

export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Polls `GetMediaDownload` until the worker (P5-002) reports READY or FAILED, or
 * `timeoutMs` elapses — whichever comes first. Never throws on timeout; the caller
 * decides what "still processing" means for its UI. */
export async function pollUntilReady(
  api: PatchesApi,
  accessToken: string,
  mediaId: string,
  options: PollOptions = {},
): Promise<GetMediaDownloadResponse> {
  const intervalMs = options.intervalMs ?? 500;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const response = await api.getMediaDownload({ mediaId }, accessToken);
    if (response.status === MEDIA_STATUS.READY || response.status === MEDIA_STATUS.FAILED) {
      return response;
    }
    if (Date.now() >= deadline) return response;
    await sleep(intervalMs);
  }
}

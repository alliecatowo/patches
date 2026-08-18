import type { MediaState } from '@patches/database';

/** Service-facing DTOs for `patches.v1.MediaService` — decoupled from the generated proto
 * types on purpose (spec §128): the controller is the only place that knows about
 * `BeginMediaUploadRequest`/`Response` etc. */

export interface BeginMediaUploadInput {
  actorId: string;
  mimeType: string;
  /** Client-declared upload size, in bytes — validated against `MAX_MEDIA_BYTES` and pinned
   * into the presigned PUT's signature, but never trusted as the final `media.byte_size`
   * (only the worker's decoded value is, per §31). */
  byteSize: number;
  /** Client-computed SHA-256 (hex) — passed through to the `PROCESS_MEDIA` job so the worker
   * can verify it against what it actually downloaded before marking `READY`. */
  sha256: string;
}

export interface BeginMediaUploadResult {
  mediaId: string;
  uploadUrl: string;
  expiresAt: Date;
}

export interface FinalizeMediaUploadResult {
  mediaId: string;
  state: MediaState;
}

export interface MediaDownloadView {
  mediaId: string;
  state: MediaState;
  mimeType: string;
  width: number;
  height: number;
  downloadUrl: string;
  thumbnailUrl: string;
  expiresAt: Date;
}

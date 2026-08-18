import type { MediaState } from '@patches/database';
import { dateToTimestamp } from '@patches/proto';
import { MediaStatus } from '@patches/proto/nest';

/** `@patches/proto` exports `dateToTimestamp`/`timestampToDate` but not the `WireTimestamp`
 * type itself (root package scope, not mine to extend) — derived here instead of hand-copying
 * the `{ seconds, nanos }` shape. */
type WireTimestamp = ReturnType<typeof dateToTimestamp>;

import type { MediaDownloadView } from './media.dto.js';

/**
 * `media.state` (database, `PENDING_UPLOAD`/`PROCESSING`/`READY`/`FAILED`/`DELETED`) →
 * `MediaStatus` (proto, no `DELETED` value). A tombstoned row should never reach a client
 * through `GetMediaDownload` in practice (§32 — it's only reachable via a `mediaId` the
 * caller already owns, and there's no listing RPC for media), but the mapper still has to be
 * total: `DELETED` maps to `MEDIA_STATUS_FAILED` rather than throwing, since "this media is
 * gone" and "this media failed processing" are the same actionable outcome for a caller
 * (retry with a fresh upload).
 */
const MEDIA_STATE_TO_STATUS: Readonly<Record<MediaState, MediaStatus>> = Object.freeze({
  PENDING_UPLOAD: MediaStatus.MEDIA_STATUS_PENDING,
  PROCESSING: MediaStatus.MEDIA_STATUS_PROCESSING,
  READY: MediaStatus.MEDIA_STATUS_READY,
  FAILED: MediaStatus.MEDIA_STATUS_FAILED,
  DELETED: MediaStatus.MEDIA_STATUS_FAILED,
});

export function toProtoMediaStatus(state: MediaState): MediaStatus {
  return MEDIA_STATE_TO_STATUS[state];
}

export function toProtoTimestamp(date: Date): WireTimestamp {
  return dateToTimestamp(date);
}

export interface GetMediaDownloadResponseShape {
  mediaId: string;
  status: MediaStatus;
  mimeType: string;
  width: number;
  height: number;
  downloadUrl: string;
  thumbnailUrl: string;
  expiresAt: WireTimestamp;
}

export function toGetMediaDownloadResponse(view: MediaDownloadView): GetMediaDownloadResponseShape {
  return {
    mediaId: view.mediaId,
    status: toProtoMediaStatus(view.state),
    mimeType: view.mimeType,
    width: view.width,
    height: view.height,
    downloadUrl: view.downloadUrl,
    thumbnailUrl: view.thumbnailUrl,
    expiresAt: toProtoTimestamp(view.expiresAt),
  };
}

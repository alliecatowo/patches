/**
 * `PrivacyService`'s own vocabulary (spec §128–129) — never an entity past this layer.
 */
export interface PrivacyPrefsView {
  discoverable: boolean;
  indexable: boolean;
  showInLocalFeed: boolean;
  locked: boolean;
  /** `null` means the caller has never acknowledged any privacy notice version. */
  privacyNoticeVersion: number | null;
  privacyNoticeAcknowledgedAt: Date | null;
}

/** Field-mask-selected partial update input for `UpdatePrivacyPrefs` — same shape as
 * `ActorService.UpdateProfile`'s `UpdateProfileInput` (spec: `privacy.proto`'s
 * `UpdatePrivacyPrefsRequest` doc, which fields it may touch). */
export interface UpdatePrivacyPrefsInput {
  actorId: string;
  discoverable: boolean;
  indexable: boolean;
  showInLocalFeed: boolean;
  locked: boolean;
  /** `google.protobuf.FieldMask` paths, snake_case (proto field names) — same convention as
   * every other field-mask RPC in this codebase. */
  updateMask: readonly string[];
}

export type AccountExportStatusView = 'PENDING' | 'READY' | 'FAILED' | 'EXPIRED';

export interface AccountExportView {
  id: string;
  status: AccountExportStatusView;
  requestedAt: Date;
  readyAt: Date | null;
  /** A short-lived pre-signed URL, derived at read time from the row's private object key —
   * never the key itself (spec §29, §197.3, ADR 0005). `null` until `READY`. */
  downloadUrl: string | null;
  expiresAt: Date | null;
}

export interface AccountDeletionStatusView {
  /** `true` while a deletion is requested, not cancelled, and not yet purged. */
  pending: boolean;
  requestedAt: Date | null;
  purgeAfter: Date | null;
  cancelledAt: Date | null;
}

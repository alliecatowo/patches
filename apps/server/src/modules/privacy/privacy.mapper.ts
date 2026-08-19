import { dateToTimestamp } from '@patches/proto';
import {
  AccountExportStatus,
  type AccountDeletionStatus as ProtoAccountDeletionStatus,
  type AccountExport as ProtoAccountExport,
  type PrivacyPrefs as ProtoPrivacyPrefs,
} from '@patches/proto/nest';

import type {
  AccountDeletionStatusView,
  AccountExportStatusView,
  AccountExportView,
  PrivacyPrefsView,
} from './privacy.dto.js';

const STATUS_TO_PROTO: Readonly<Record<AccountExportStatusView, AccountExportStatus>> =
  Object.freeze({
    PENDING: AccountExportStatus.ACCOUNT_EXPORT_STATUS_PENDING,
    READY: AccountExportStatus.ACCOUNT_EXPORT_STATUS_READY,
    FAILED: AccountExportStatus.ACCOUNT_EXPORT_STATUS_FAILED,
    EXPIRED: AccountExportStatus.ACCOUNT_EXPORT_STATUS_EXPIRED,
  });

/** Application DTO → protobuf message (spec §128), field-by-field — never an entity past
 * `PrivacyService` (spec §153). */
export function toProtoPrivacyPrefs(view: PrivacyPrefsView): ProtoPrivacyPrefs {
  return {
    discoverable: view.discoverable,
    indexable: view.indexable,
    showInLocalFeed: view.showInLocalFeed,
    locked: view.locked,
    privacyNoticeVersion: view.privacyNoticeVersion ?? 0,
    privacyNoticeAcknowledgedAt:
      view.privacyNoticeAcknowledgedAt === null
        ? undefined
        : dateToTimestamp(view.privacyNoticeAcknowledgedAt),
  };
}

export function toProtoAccountExport(view: AccountExportView): ProtoAccountExport {
  return {
    id: view.id,
    status: STATUS_TO_PROTO[view.status],
    requestedAt: dateToTimestamp(view.requestedAt),
    readyAt: view.readyAt === null ? undefined : dateToTimestamp(view.readyAt),
    downloadUrl: view.downloadUrl ?? '',
    expiresAt: view.expiresAt === null ? undefined : dateToTimestamp(view.expiresAt),
  };
}

export function toProtoAccountDeletionStatus(
  view: AccountDeletionStatusView,
): ProtoAccountDeletionStatus {
  return {
    pending: view.pending,
    requestedAt: view.requestedAt === null ? undefined : dateToTimestamp(view.requestedAt),
    purgeAfter: view.purgeAfter === null ? undefined : dateToTimestamp(view.purgeAfter),
    cancelledAt: view.cancelledAt === null ? undefined : dateToTimestamp(view.cancelledAt),
  };
}

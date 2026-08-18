import { dateToTimestamp } from '@patches/proto';
import type {
  GuestbookEntry as ProtoGuestbookEntry,
  PageRevisionSummary as ProtoPageRevisionSummary,
  PageTheme as ProtoPageTheme,
} from '@patches/proto';

import { toProtoActor } from '../auth/auth.mapper.js';
import type { GuestbookEntryView, PageRevisionSummaryView, PageThemeView } from './pages.dto.js';

/**
 * Application DTO → protobuf message (spec §128), field-by-field — see `auth.mapper.ts`'s
 * comment on why never a spread.
 */

export function toProtoPageTheme(theme: PageThemeView): ProtoPageTheme {
  return {
    accent: theme.accent,
    background: theme.background,
    foreground: theme.foreground,
    border: theme.border,
    avatarStyle: theme.avatarStyle,
  };
}

export function toProtoPageRevisionSummary(
  revision: PageRevisionSummaryView,
): ProtoPageRevisionSummary {
  return {
    id: revision.id,
    byteSize: revision.byteSize,
    createdAt: dateToTimestamp(revision.createdAt),
  };
}

export function toProtoGuestbookEntry(entry: GuestbookEntryView): ProtoGuestbookEntry {
  return {
    id: entry.id,
    author: entry.author === null ? undefined : toProtoActor(entry.author),
    body: entry.body,
    createdAt: dateToTimestamp(entry.createdAt),
  };
}

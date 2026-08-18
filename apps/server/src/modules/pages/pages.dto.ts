import type { ActorSummary } from '../auth/auth.dto.js';

/**
 * `PageService`'s own vocabulary (spec §128–129) — a `Page`/`PageRevision`/`GuestbookEntry`
 * entity never reaches `PagesController`. Reuses `auth.dto.ts`'s `ActorSummary` for a
 * guestbook entry's author, same reuse pattern as `PostView.author` (`modules/posts/post.dto
 * .ts`).
 */

export interface PageThemeView {
  accent: string;
  background: string;
  foreground: string;
  border: string;
  avatarStyle: string;
}

export interface GetPageResult {
  ownerActorId: string;
  revisionId: string;
  /** Canonical JSON text of the stored revision — the raw `page_revisions.document` jsonb
   * re-serialized as-is, never re-shaped through `packages/domain`'s types. A revision was
   * already validated strictly at write time (`PageService.updatePage`); re-parsing it here
   * would only risk dropping fields a *newer* schema version wrote that this server doesn't
   * recognize (spec §171 — "a page written by a newer schema version never fails to load on
   * an older server"). */
  document: string;
  activeSlug: string;
  theme: PageThemeView;
  updatedAt: Date;
}

export interface UpdatePageResult {
  revisionId: string;
  document: string;
  updatedAt: Date;
}

export interface PageRevisionSummaryView {
  id: string;
  byteSize: number;
  createdAt: Date;
}

export interface ListPageRevisionsResult {
  revisions: PageRevisionSummaryView[];
  nextCursor: string;
  hasMore: boolean;
}

export interface GuestbookEntryView {
  id: string;
  /** `null` for a future non-local/remote signer (`guestbook_entries.author_actor_id` is
   * nullable) — never `null` for anything `PageService.signGuestbook` itself creates. */
  author: ActorSummary | null;
  body: string;
  createdAt: Date;
}

export interface ListGuestbookResult {
  entries: GuestbookEntryView[];
  nextCursor: string;
  hasMore: boolean;
}

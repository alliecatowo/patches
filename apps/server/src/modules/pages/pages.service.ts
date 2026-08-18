import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  Actor,
  Block,
  GuestbookEntry,
  Page,
  PageRevision,
  Report,
  type ReportReason as DbReportReason,
} from '@patches/database';
import {
  isPageValidationError,
  parsePageForRender,
  parsePageStrict,
  serializePage,
  type PatchesPage,
} from '@patches/domain';
import { DataSource, type EntityManager } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { toActorSummary } from '../auth/auth.dto.js';
import { normalizeHandle } from '../auth/validation.js';
import { clampLimit, decodeCursor, pageInfoFor } from '../feeds/pagination.js';
import type {
  GetPageResult,
  GuestbookEntryView,
  ListGuestbookResult,
  ListPageRevisionsResult,
  PageThemeView,
  UpdatePageResult,
} from './pages.dto.js';
import {
  normalizeGuestbookBody,
  normalizeSlug,
  parseInput,
  uuidInputSchema,
} from './validation.js';

/**
 * The application service behind `patches.v1.PageService` (spec §170–172, Phase 4.5,
 * P45-003). The server stores, validates, versions, and serves the document — it never
 * renders (`docs/architecture/pages.md`).
 *
 * Block enforcement (spec §62) mirrors `PostService`: `getPage`/`listGuestbook` take an
 * optional `viewerActorId` and `signGuestbook` always has one, and every one of them returns
 * a uniform `PAGE_NOT_FOUND` for a missing actor, a missing/unpublished page, *or* a
 * blocked-either-direction relationship — never a `PERMISSION_DENIED` that would leak which
 * of those is true to a blocked caller.
 *
 * The wire's `slug` field is accepted and validated on every RPC that takes one, but the
 * database has exactly one `guestbook_entries` row set per `pages` row (see `page.entity.ts`)
 * — there is no per-sub-page guestbook yet, even though a `Guestbook` block could in principle
 * appear on more than one sub-page. `slug` is threaded through today only so a future
 * multi-guestbook schema change doesn't also have to change the wire contract; until then it
 * only affects `GetPageResponse.active_slug`.
 */

const MAX_REPORT_DETAILS_LENGTH = 2000;

@Injectable()
export class PageService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Anonymous-callable, block-aware (spec §62). */
  async getPage(
    handleRaw: string,
    slugRaw: string,
    viewerActorId?: string,
  ): Promise<GetPageResult> {
    const activeSlug = normalizeSlug(slugRaw);
    const { page } = await this.resolveOwnerPage(handleRaw, viewerActorId);

    // `resolveOwnerPage` already checked `currentRevisionId !== null`.
    const revision = await this.dataSource
      .getRepository(PageRevision)
      .findOne({ where: { id: page.currentRevisionId! } });
    if (revision === null) throw pageNotFound();

    return {
      ownerActorId: page.actorId,
      revisionId: revision.id,
      document: JSON.stringify(revision.document),
      activeSlug,
      theme: themeViewOf(revision.document),
      updatedAt: page.updatedAt,
    };
  }

  /**
   * Whole-document replace, always on the caller's own page — `UpdatePageRequest` carries no
   * target, only `document` (spec: `pages.proto`'s doc comment). Creates the `pages` row
   * lazily on the caller's first write. Strictly validated against `packages/domain`'s
   * declared schema version (§171) before anything is written; always inserts a new immutable
   * `page_revisions` row rather than mutating one in place.
   */
  async updatePage(actorId: string, documentBytes: Uint8Array): Promise<UpdatePageResult> {
    const parsed = parseStrictDocument(parseJsonDocument(documentBytes));
    const serialized = serializePage(parsed);
    const byteSize = Buffer.byteLength(serialized, 'utf8');

    return this.dataSource.transaction(async (manager) => {
      const pages = manager.getRepository(Page);
      let page = await pages.findOne({ where: { actorId } });
      page ??= await pages.save(pages.create({ actorId, visibility: 'PUBLIC' }));

      const revision = await this.insertNextRevision(manager, page.id, actorId, parsed, byteSize);
      const updated = await pages.save(Object.assign(page, { currentRevisionId: revision.id }));

      return { revisionId: revision.id, document: serialized, updatedAt: updated.updatedAt };
    });
  }

  /** The caller's own page's revision history, most-recent first. An actor with no page yet
   * (never called `UpdatePage`) simply has no revisions — not an error. */
  async listPageRevisions(
    actorId: string,
    cursorRaw: string,
    limit: number,
  ): Promise<ListPageRevisionsResult> {
    const cursor = decodeCursor(cursorRaw);
    const take = clampLimit(limit);

    const page = await this.dataSource.getRepository(Page).findOne({ where: { actorId } });
    if (page === null) return { revisions: [], nextCursor: '', hasMore: false };

    const qb = this.dataSource
      .getRepository(PageRevision)
      .createQueryBuilder('revision')
      .where('revision.pageId = :pageId', { pageId: page.id })
      .orderBy('revision.createdAt', 'DESC')
      .addOrderBy('revision.id', 'DESC')
      .take(take + 1);
    if (cursor !== undefined) {
      qb.andWhere('(revision.createdAt, revision.id) < (:cursorCreatedAt, :cursorId)', {
        cursorCreatedAt: cursor.createdAt,
        cursorId: cursor.id,
      });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > take;
    const pageRows = hasMore ? rows.slice(0, take) : rows;
    const { nextCursor } = pageInfoFor(pageRows, hasMore, (row) => ({
      createdAt: row.createdAt,
      id: row.id,
    }));
    return {
      revisions: pageRows.map((row) => ({
        id: row.id,
        byteSize: row.byteSize,
        createdAt: row.createdAt,
      })),
      nextCursor,
      hasMore,
    };
  }

  /** Anonymous-callable, block-aware like {@link getPage}. Excludes removed entries. */
  async listGuestbook(
    handleRaw: string,
    slugRaw: string,
    cursorRaw: string,
    limit: number,
    viewerActorId?: string,
  ): Promise<ListGuestbookResult> {
    normalizeSlug(slugRaw); // validated for shape; see the class doc for why it's otherwise unused.
    const { page } = await this.resolveOwnerPage(handleRaw, viewerActorId);
    const cursor = decodeCursor(cursorRaw);
    const take = clampLimit(limit);

    const qb = this.dataSource
      .getRepository(GuestbookEntry)
      .createQueryBuilder('entry')
      .leftJoinAndSelect('entry.authorActor', 'author')
      .where('entry.pageId = :pageId', { pageId: page.id })
      .andWhere('entry.removedAt IS NULL')
      .orderBy('entry.createdAt', 'DESC')
      .addOrderBy('entry.id', 'DESC')
      .take(take + 1);
    if (cursor !== undefined) {
      qb.andWhere('(entry.createdAt, entry.id) < (:cursorCreatedAt, :cursorId)', {
        cursorCreatedAt: cursor.createdAt,
        cursorId: cursor.id,
      });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > take;
    const pageRows = hasMore ? rows.slice(0, take) : rows;
    const { nextCursor } = pageInfoFor(pageRows, hasMore, (row) => ({
      createdAt: row.createdAt,
      id: row.id,
    }));
    return { entries: pageRows.map(toGuestbookEntryView), nextCursor, hasMore };
  }

  /**
   * Requires an authenticated session (there is no anonymous guestbook signature); rate
   * limiting is enforced by `PagesController` before this is called, same layering as
   * `ModerationController.reportPost`. Block-aware like {@link getPage} — a blocked-either-
   * direction caller gets the same uniform `PAGE_NOT_FOUND` (spec §62, §172).
   */
  async signGuestbook(
    actorId: string,
    handleRaw: string,
    slugRaw: string,
    bodyRaw: string,
  ): Promise<GuestbookEntryView> {
    normalizeSlug(slugRaw);
    const body = normalizeGuestbookBody(bodyRaw);
    const { page } = await this.resolveOwnerPage(handleRaw, actorId);

    return this.dataSource.transaction(async (manager) => {
      const entries = manager.getRepository(GuestbookEntry);
      const saved = await entries.save(
        entries.create({ pageId: page.id, authorActorId: actorId, body }),
      );
      const withAuthor = await entries.findOneOrFail({
        where: { id: saved.id },
        relations: { authorActor: true },
      });
      return toGuestbookEntryView(withAuthor);
    });
  }

  /** Owner only (moderator removal is a documented follow-up — see `docs/architecture/pages
   * .md`). Idempotent: removing an already-removed entry just returns it. */
  async removeGuestbookEntry(actorId: string, entryIdRaw: string): Promise<GuestbookEntryView> {
    const entryId = parseInput(uuidInputSchema, entryIdRaw);

    return this.dataSource.transaction(async (manager) => {
      const entries = manager.getRepository(GuestbookEntry);
      const entry = await entries.findOne({
        where: { id: entryId },
        relations: { page: true, authorActor: true },
      });
      if (entry === null) throw guestbookEntryNotFound();
      if (entry.page.actorId !== actorId) throw pageForbidden();

      if (entry.removedAt === null) {
        await entries.update({ id: entryId }, { removedAt: new Date(), removedByActorId: actorId });
      }
      const updated = await entries.findOneOrFail({
        where: { id: entryId },
        relations: { authorActor: true },
      });
      return toGuestbookEntryView(updated);
    });
  }

  /** Bounded report of a guestbook entry (spec §64, §172); reuses `reports.subject_type =
   * 'GUESTBOOK_ENTRY'` (P45-003) rather than a second reports table. */
  async reportGuestbookEntry(
    actorId: string,
    entryIdRaw: string,
    reason: DbReportReason,
    detailsRaw: string,
  ): Promise<string> {
    const entryId = parseInput(uuidInputSchema, entryIdRaw);
    const entry = await this.dataSource.getRepository(GuestbookEntry).findOne({
      where: { id: entryId },
    });
    if (entry === null) throw guestbookEntryNotFound();

    const reports = this.dataSource.getRepository(Report);
    const saved = await reports.save(
      reports.create({
        reporterActorId: actorId,
        subjectType: 'GUESTBOOK_ENTRY',
        subjectGuestbookEntryId: entryId,
        reason,
        details: normalizeReportDetails(detailsRaw),
      }),
    );
    return saved.id;
  }

  // ---------------------------------------------------------------- internals

  /** Resolves `handle` to an actor and its `pages` row, applying the block check (spec §62)
   * against `viewerActorId` when one is present. Throws the same `PAGE_NOT_FOUND` whether the
   * actor doesn't exist, is soft-deleted, has no page yet, or is blocked either-direction from
   * the viewer — a uniform code, same reasoning as `PostService.getPost`. */
  private async resolveOwnerPage(
    handleRaw: string,
    viewerActorId?: string,
  ): Promise<{ actor: Actor; page: Page }> {
    const handleNormalized = normalizeHandle(handleRaw);
    const actor = await this.dataSource
      .getRepository(Actor)
      .findOne({ where: { handleNormalized } });
    if (actor === null || actor.deletedAt !== null) throw pageNotFound();

    if (
      viewerActorId !== undefined &&
      (await this.blockedEitherDirection(this.dataSource.manager, viewerActorId, actor.id))
    ) {
      throw pageNotFound();
    }

    const page = await this.dataSource
      .getRepository(Page)
      .findOne({ where: { actorId: actor.id } });
    if (page === null || page.currentRevisionId === null) throw pageNotFound();

    return { actor, page };
  }

  /** Retries once on a `(page_id, revision_number)` unique-index race (two concurrent
   * `UpdatePage` calls for the same actor) — same reasoning as `PostService.createPost`'s
   * unique-violation retry for a concurrent write, just re-deriving the next revision number
   * rather than refetching an existing row. */
  private async insertNextRevision(
    manager: EntityManager,
    pageId: string,
    createdByActorId: string,
    document: PatchesPage,
    byteSize: number,
  ): Promise<PageRevision> {
    const revisions = manager.getRepository(PageRevision);
    const documentRecord = document as unknown as Record<string, unknown>;

    for (let attempt = 0; attempt < 3; attempt++) {
      const revisionNumber = (await revisions.count({ where: { pageId } })) + 1;
      try {
        return await revisions.save(
          revisions.create({
            pageId,
            revisionNumber,
            document: documentRecord,
            byteSize,
            createdByActorId,
          }),
        );
      } catch (error) {
        if (!isUniqueViolation(error) || attempt === 2) throw error;
      }
    }
    throw AppError.internal('Could not write a new page revision.');
  }

  private async blockedEitherDirection(
    manager: EntityManager,
    actorAId: string,
    actorBId: string,
  ): Promise<boolean> {
    const blocks = manager.getRepository(Block);
    const [aBlocksB, bBlocksA] = await Promise.all([
      blocks.findOne({ where: { blockerActorId: actorAId, blockedActorId: actorBId } }),
      blocks.findOne({ where: { blockerActorId: actorBId, blockedActorId: actorAId } }),
    ]);
    return aBlocksB !== null || bBlocksA !== null;
  }
}

function toGuestbookEntryView(
  entry: GuestbookEntry & { authorActor: Actor | null },
): GuestbookEntryView {
  return {
    id: entry.id,
    author: entry.authorActor === null ? null : toActorSummary(entry.authorActor),
    body: entry.body,
    createdAt: entry.createdAt,
  };
}

/** Best-effort convenience extract of `document.theme` for `GetPageResponse.theme` — never
 * throws. A stored revision was strictly validated at write time (`updatePage`); a parse
 * failure here would mean a future-incompatible schema this server can't even understand the
 * theme shape of. The raw `document` bytes are still served either way — only this convenience
 * field degrades to "no theme" rather than failing the whole read. */
function themeViewOf(document: Record<string, unknown>): PageThemeView {
  try {
    const view = parsePageForRender(document);
    return {
      accent: view.theme?.accent ?? '',
      background: view.theme?.background ?? '',
      foreground: view.theme?.foreground ?? '',
      border: view.theme?.border ?? '',
      avatarStyle: view.theme?.avatarStyle ?? '',
    };
  } catch {
    // See the function doc comment: degrade to "no theme", never fail `GetPage` over it.
    return { accent: '', background: '', foreground: '', border: '', avatarStyle: '' };
  }
}

function parseJsonDocument(bytes: Uint8Array): unknown {
  let text: string;
  try {
    text = Buffer.from(bytes).toString('utf8');
  } catch (error) {
    throw AppError.validation('The page document must be UTF-8 encoded JSON.', { cause: error });
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw AppError.validation('The page document must be valid JSON.', { cause: error });
  }
}

function parseStrictDocument(raw: unknown): PatchesPage {
  try {
    return parsePageStrict(raw);
  } catch (error) {
    if (isPageValidationError(error)) {
      throw AppError.validation(error.message, { cause: error });
    }
    throw error;
  }
}

function normalizeReportDetails(details: string): string | null {
  const trimmed = details.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_REPORT_DETAILS_LENGTH) {
    throw AppError.validation(
      `details must be at most ${String(MAX_REPORT_DETAILS_LENGTH)} characters`,
    );
  }
  return trimmed;
}

function pageNotFound(): AppError {
  return new AppError('PAGE_NOT_FOUND', 'That page does not exist or is not visible to you.');
}

function pageForbidden(): AppError {
  return new AppError('PAGE_FORBIDDEN', 'You can only manage your own page.');
}

function guestbookEntryNotFound(): AppError {
  return new AppError('GUESTBOOK_ENTRY_NOT_FOUND', 'That guestbook entry does not exist.');
}

/** PostgreSQL's `unique_violation` SQLSTATE, surfaced by `pg` as a plain `{ code: string }` —
 * same helper `PostService`/`ModerationService`/`GraphService` use for their own idempotency
 * races. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

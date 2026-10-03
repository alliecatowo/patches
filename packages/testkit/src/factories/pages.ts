import { GuestbookEntry, Page, PageRevision } from '@patches/database';
import type { PageVisibility } from '@patches/database';
import { parsePageStrict, serializePage, type PatchesPage } from '@patches/domain';
import type { EntityManager } from 'typeorm';

/**
 * Patches Pages fixtures (`INITIAL_VISION.md` §170-172) — same shape as `content.ts`'s
 * factories: caller-supplied `EntityManager`, so fixtures roll back with
 * `withTransactionRollback`.
 */

/** A minimal, valid `PatchesPage` document — run through `parsePageStrict` so a fixture can
 * never silently drift from what the real write path accepts. */
export function testPageDocument(overrides: Record<string, unknown> = {}): PatchesPage {
  return parsePageStrict({
    version: 1,
    pages: [
      {
        slug: 'index',
        title: 'test page',
        blocks: [{ type: 'Text', body: 'hello from a fixture' }],
      },
    ],
    ...overrides,
  });
}

export interface CreateTestPageOptions {
  actorId: string;
  visibility?: PageVisibility;
  /** When omitted, a `Page` row is created with no `current_revision_id` yet — pass
   * `withRevision: true` (or call `createTestPageRevision` separately) to also seed one. */
  withRevision?: boolean;
  createdByActorId?: string;
  document?: PatchesPage;
}

export async function createTestPage(
  manager: EntityManager,
  options: CreateTestPageOptions,
): Promise<Page> {
  const pages = manager.getRepository(Page);
  const page = await pages.save(
    pages.create({
      actorId: options.actorId,
      visibility: options.visibility ?? 'PUBLIC',
    }),
  );

  if (options.withRevision !== true) return page;

  const revision = await createTestPageRevision(manager, {
    pageId: page.id,
    createdByActorId: options.createdByActorId ?? options.actorId,
    ...(options.document === undefined ? {} : { document: options.document }),
  });
  await pages.update({ id: page.id }, { currentRevisionId: revision.id });
  page.currentRevisionId = revision.id;
  return page;
}

export interface CreateTestPageRevisionOptions {
  pageId: string;
  createdByActorId: string;
  document?: PatchesPage;
  revisionNumber?: number;
}

export async function createTestPageRevision(
  manager: EntityManager,
  options: CreateTestPageRevisionOptions,
): Promise<PageRevision> {
  const revisions = manager.getRepository(PageRevision);
  const document = options.document ?? testPageDocument();
  const serialized = serializePage(document);

  const existingCount =
    options.revisionNumber ?? (await revisions.count({ where: { pageId: options.pageId } })) + 1;

  return revisions.save(
    revisions.create({
      pageId: options.pageId,
      revisionNumber: existingCount,
      document: document as unknown as Record<string, unknown>,
      byteSize: Buffer.byteLength(serialized, 'utf8'),
      createdByActorId: options.createdByActorId,
    }),
  );
}

export interface CreateTestGuestbookEntryOptions {
  pageId: string;
  authorActorId?: string | null;
  body?: string;
  createdAt?: Date;
  removedAt?: Date | null;
  removedByActorId?: string | null;
}

export async function createTestGuestbookEntry(
  manager: EntityManager,
  options: CreateTestGuestbookEntryOptions,
): Promise<GuestbookEntry> {
  const entries = manager.getRepository(GuestbookEntry);
  return entries.save(
    entries.create({
      pageId: options.pageId,
      authorActorId: options.authorActorId ?? null,
      body: options.body ?? 'nice page!',
      removedAt: options.removedAt ?? null,
      removedByActorId: options.removedByActorId ?? null,
      ...(options.createdAt === undefined ? {} : { createdAt: options.createdAt }),
    }),
  );
}

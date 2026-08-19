import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Actor, Tag, TagMute } from '@patches/database';
import { RATE_LIMITS } from '@patches/domain';
import { DataSource } from 'typeorm';
import { z } from 'zod';

import { AppError } from '../../common/errors/app-error.js';
import { clampLimit as clampListLimit, decodeCursor, pageInfoFor } from '../feeds/pagination.js';
import type { TagListPage, TagView } from './tag.dto.js';
import { normalizeTagIdentity } from './tag-grammar.js';

const uuidInputSchema = z.uuid('must be a valid id');

function parseTagId(value: string): string {
  const result = uuidInputSchema.safeParse(value);
  if (!result.success) throw AppError.validation('tag_id must be a valid id.');
  return result.data;
}

/** §181: "returns at most 20 tags" — a fixed ceiling, not the generic list-RPC default/max
 * (`modules/feeds/pagination.ts`'s `DEFAULT_PAGE_SIZE`/`MAX_PAGE_SIZE`, which other services
 * use). */
const SEARCH_TAGS_MAX_RESULTS = 20;
const TAG_SEARCH_PREFIX_PATTERN = /^[\p{L}\p{N}_]*$/u;

function clampSearchLimit(requested: number): number {
  if (!Number.isFinite(requested) || requested <= 0) return SEARCH_TAGS_MAX_RESULTS;
  return Math.min(Math.trunc(requested), SEARCH_TAGS_MAX_RESULTS);
}

/** `SearchTags` orders alphabetically by `name` (§181 — "MUST NOT order by popularity,
 * recency of use, or post count"), not the canonical `(created_at, id)` keyset every other
 * list RPC uses — so it needs its own, much simpler cursor: the opaque encoding of the last
 * returned `name`, nothing else. */
function decodeNameCursor(raw: string): string | undefined {
  if (raw.length === 0) return undefined;
  try {
    const name = Buffer.from(raw, 'base64url').toString('utf8');
    if (name.length === 0) throw new Error('empty cursor');
    return name;
  } catch (error) {
    throw AppError.validation('Invalid pagination cursor.', { cause: error });
  }
}

function encodeNameCursor(name: string): string {
  return Buffer.from(name, 'utf8').toString('base64url');
}

/**
 * The application service behind `patches.v1.TagService` (spec §181, §189–190). Deliberately
 * has no "popular tags"/"trending" method anywhere on this class — see the module doc on
 * `tags.proto` for why that is a hard rule, not an oversight.
 */
@Injectable()
export class TagService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Normalized-prefix match, ordered alphabetically, at most
   * {@link SEARCH_TAGS_MAX_RESULTS} results (§181) — provably not popularity-based because
   * `tags` has no popularity column to sort by (§181, `tag.entity.ts`'s class doc). */
  async searchTags(queryRaw: string, cursorRaw: string, limit: number): Promise<TagListPage> {
    const prefix = normalizeTagIdentity(queryRaw.trim()).replace(/^#/, '');
    if (
      [...prefix].length > 30 ||
      !TAG_SEARCH_PREFIX_PATTERN.test(prefix) ||
      /\p{M}/u.test(prefix)
    ) {
      throw AppError.validation('query must be a valid tag-name prefix.');
    }
    const cursorName = decodeNameCursor(cursorRaw);
    const take = clampSearchLimit(limit);

    const qb = this.dataSource
      .getRepository(Tag)
      .createQueryBuilder('tag')
      .orderBy('tag.name', 'ASC')
      .take(take + 1);

    if (prefix.length > 0) {
      qb.andWhere('tag.name LIKE :prefix', { prefix: `${escapeLike(prefix)}%` });
    }
    if (cursorName !== undefined) {
      qb.andWhere('tag.name > :cursorName', { cursorName });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const last = page.at(-1);

    return {
      tags: page.map(toTagView),
      nextCursor: hasMore && last !== undefined ? encodeNameCursor(last.name) : '',
      hasMore,
    };
  }

  /** Idempotent: muting an already-muted tag is not an error (spec §181). */
  async muteTag(actorId: string, tagIdRaw: string): Promise<void> {
    const tagId = parseTagId(tagIdRaw);
    await this.dataSource.transaction(async (manager) => {
      // Serialize all mute additions for one actor so two different tags cannot both observe
      // 99 and push the list beyond §188's hard total of 100.
      await manager.getRepository(Actor).findOneOrFail({
        where: { id: actorId },
        lock: { mode: 'pessimistic_write' },
      });

      const tag = await manager.getRepository(Tag).findOne({ where: { id: tagId } });
      if (tag === null) throw new AppError('TAG_NOT_FOUND', 'That tag does not exist.');

      const mutes = manager.getRepository(TagMute);
      const existing = await mutes.findOne({ where: { actorId, tagId } });
      if (existing !== null) return;

      const total = await mutes.countBy({ actorId });
      if (total >= RATE_LIMITS.tagMuteTotal) {
        throw AppError.validation(`You can mute at most ${String(RATE_LIMITS.tagMuteTotal)} tags.`);
      }

      try {
        await mutes.save(mutes.create({ actorId, tagId }));
      } catch (error) {
        // A duplicate retry can still race before the actor lock is acquired; the composite
        // PK is the final idempotency backstop.
        if (!isUniqueViolation(error)) throw error;
      }
    });
  }

  /** Idempotent: unmuting a tag the caller hasn't muted — or that doesn't exist at all — is
   * not an error (spec §181), so this never looks the tag id up first. */
  async unmuteTag(actorId: string, tagIdRaw: string): Promise<void> {
    const tagId = parseTagId(tagIdRaw);
    await this.dataSource.getRepository(TagMute).delete({ actorId, tagId });
  }

  /** The caller's own muted tags, most-recent first (spec §189). */
  async listMutedTags(actorId: string, cursorRaw: string, limit: number): Promise<TagListPage> {
    const cursor = decodeCursor(cursorRaw);
    const take = clampListLimit(limit);

    const qb = this.dataSource
      .getRepository(TagMute)
      .createQueryBuilder('mute')
      .innerJoinAndSelect('mute.tag', 'tag')
      .where('mute.actorId = :actorId', { actorId })
      .orderBy('mute.createdAt', 'DESC')
      .addOrderBy('mute.tagId', 'DESC')
      .take(take + 1);

    if (cursor !== undefined) {
      qb.andWhere('(mute.createdAt, mute.tagId) < (:cursorCreatedAt, :cursorId)', {
        cursorCreatedAt: cursor.createdAt,
        cursorId: cursor.id,
      });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const { nextCursor } = pageInfoFor(page, hasMore, (row) => ({
      createdAt: row.createdAt,
      id: row.tagId,
    }));

    return { tags: page.map((row) => toTagView(row.tag)), nextCursor, hasMore };
  }
}

function toTagView(tag: Tag): TagView {
  return { id: tag.id, name: tag.name, displayName: tag.displayName, createdAt: tag.createdAt };
}

/** Escapes `%`/`_`/`\` so a search query can never smuggle SQL `LIKE` wildcards in as its own
 * matching behavior. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

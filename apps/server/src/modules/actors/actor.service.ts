import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Actor, Follow, Post } from '@patches/database';
import { IsNull, type DataSource, type EntityManager } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { clampLimit, decodeCursor, pageInfoFor } from '../feeds/pagination.js';
import { normalizeHandle } from '../auth/validation.js';
import { toActorProfile, type ActorCountsSummary, type ActorProfile } from './actor.dto.js';
import {
  bioSchema,
  displayNameSchema,
  locationTextSchema,
  NAMEPLATE_MAX_BYTES,
  nameplateInputSchema,
  parseInput,
  searchQuerySchema,
  uuidInputSchema,
  websiteUrlSchema,
  type NameplateInput,
} from './validation.js';

/**
 * The application service behind `patches.v1.ActorService` (spec §19, §21, §49, §50, §112).
 */

export interface UpdateProfileInput {
  actorId: string;
  displayName?: string;
  bio?: string;
  locationText?: string;
  websiteUrl?: string;
  nameplate?: NameplateInput;
  /** Proto field names (snake_case), e.g. `["display_name", "bio"]`; only these are applied. */
  updateMask: readonly string[];
}

export interface ActorListPage {
  actors: ActorProfile[];
  nextCursor: string;
  hasMore: boolean;
}

@Injectable()
export class ActorService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getActor(id: string): Promise<ActorProfile> {
    const parsed = parseInput(uuidInputSchema, id);
    const actor = await this.dataSource.getRepository(Actor).findOne({ where: { id: parsed } });
    if (actor === null || actor.deletedAt !== null) throw actorNotFound();
    return toActorProfile(actor, await this.countsFor(actor.id));
  }

  async getActorByHandle(handle: string): Promise<ActorProfile> {
    const handleNormalized = normalizeHandle(handle);
    const actor = await this.dataSource
      .getRepository(Actor)
      .findOne({ where: { handleNormalized } });
    if (actor === null || actor.deletedAt !== null) throw actorNotFound();
    return toActorProfile(actor, await this.countsFor(actor.id));
  }

  /** Partial update of the caller's own profile, driven by `update_mask` (spec: `actors.proto`'s
   * `UpdateProfileRequest` doc). A field not named in the mask is left untouched even if set on
   * the request — that is the whole point of a `FieldMask` over plain optional fields. */
  async updateProfile(input: UpdateProfileInput): Promise<ActorProfile> {
    const paths = new Set(input.updateMask);
    const patch: Partial<
      Pick<Actor, 'displayName' | 'bio' | 'locationText' | 'websiteUrl' | 'nameplate'>
    > = {};

    if (paths.has('display_name')) {
      const value = parseInput(displayNameSchema, input.displayName ?? '');
      patch.displayName = value.length === 0 ? null : value;
    }
    if (paths.has('bio')) {
      const value = parseInput(bioSchema, input.bio ?? '');
      patch.bio = value.length === 0 ? null : value;
    }
    if (paths.has('location_text')) {
      const value = parseInput(locationTextSchema, input.locationText ?? '');
      patch.locationText = value.length === 0 ? null : value;
    }
    if (paths.has('website_url')) {
      const raw = (input.websiteUrl ?? '').trim();
      patch.websiteUrl = raw.length === 0 ? null : parseInput(websiteUrlSchema, raw);
    }

    // Parsed up front (like every other field) but *applied* inside the transaction below,
    // once the actor's current `badges` are known — see `buildNameplateRecord`.
    const parsedNameplate = paths.has('nameplate')
      ? parseInput(nameplateInputSchema, input.nameplate ?? {})
      : undefined;

    return this.dataSource.transaction(async (manager) => {
      const actors = manager.getRepository(Actor);
      const actor = await actors.findOne({ where: { id: input.actorId } });
      if (actor === null || actor.deletedAt !== null) throw actorNotFound();

      if (parsedNameplate !== undefined) {
        patch.nameplate = buildNameplateRecord(parsedNameplate, actor.nameplate);
      }

      // `Object.assign` + `save()` on the loaded entity, not `repository.update(id, patch)`:
      // `_QueryDeepPartialEntity` does not accept a plain object for the `nameplate` jsonb
      // column (its `Record<string, unknown>` index signature confuses TypeORM's deep-partial
      // mapper under `exactOptionalPropertyTypes`) — assigning onto a concrete `Actor` instance
      // sidesteps that entirely.
      const updated =
        Object.keys(patch).length > 0 ? await actors.save(Object.assign(actor, patch)) : actor;
      return toActorProfile(updated, await this.countsFor(updated.id, manager));
    });
  }

  /** Handle-prefix + display-name match (spec §112), bounded and keyset-paginated on the
   * actor's own `(created_at DESC, id DESC)` — newest matching actors first. Postgres trigram/
   * full-text search is future work; a plain `LIKE`/`ILIKE` is what v0 ships. */
  async searchActors(queryRaw: string, cursorRaw: string, limit: number): Promise<ActorListPage> {
    const query = parseInput(searchQuerySchema, queryRaw);
    const cursor = decodeCursor(cursorRaw);
    const take = clampLimit(limit);

    const qb = this.dataSource
      .getRepository(Actor)
      .createQueryBuilder('actor')
      .where('actor.deletedAt IS NULL')
      .andWhere('(actor.handleNormalized LIKE :prefix OR actor.displayName ILIKE :contains)', {
        prefix: `${query.toLowerCase()}%`,
        contains: `%${query}%`,
      })
      .orderBy('actor.createdAt', 'DESC')
      .addOrderBy('actor.id', 'DESC')
      .take(take + 1);

    if (cursor !== undefined) {
      qb.andWhere('(actor.createdAt, actor.id) < (:cursorCreatedAt, :cursorId)', {
        cursorCreatedAt: cursor.createdAt,
        cursorId: cursor.id,
      });
    }

    return this.actorPageOf(await qb.getMany(), take);
  }

  /** Cursor-paginated list of actors following `actorId` (spec §49). */
  async listFollowers(actorId: string, cursorRaw: string, limit: number): Promise<ActorListPage> {
    return this.listRelatedActors('followeeActorId', 'followerActor', actorId, cursorRaw, limit);
  }

  /** Cursor-paginated list of actors `actorId` follows (spec §49). */
  async listFollowing(actorId: string, cursorRaw: string, limit: number): Promise<ActorListPage> {
    return this.listRelatedActors('followerActorId', 'followeeActor', actorId, cursorRaw, limit);
  }

  // ---------------------------------------------------------------- internals

  private async listRelatedActors(
    matchColumn: 'followeeActorId' | 'followerActorId',
    joinRelation: 'followerActor' | 'followeeActor',
    actorIdRaw: string,
    cursorRaw: string,
    limit: number,
  ): Promise<ActorListPage> {
    const actorId = parseInput(uuidInputSchema, actorIdRaw);
    const cursor = decodeCursor(cursorRaw);
    const take = clampLimit(limit);

    const qb = this.dataSource
      .getRepository(Follow)
      .createQueryBuilder('follow')
      .leftJoinAndSelect(`follow.${joinRelation}`, 'relatedActor')
      .where(`follow.${matchColumn} = :actorId`, { actorId })
      .orderBy('follow.createdAt', 'DESC')
      .addOrderBy('follow.id', 'DESC')
      .take(take + 1);

    if (cursor !== undefined) {
      qb.andWhere('(follow.createdAt, follow.id) < (:cursorCreatedAt, :cursorId)', {
        cursorCreatedAt: cursor.createdAt,
        cursorId: cursor.id,
      });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    // Real counts (B-020), batched with one grouped query per count kind for the whole
    // page rather than the N+1 a per-row `countsFor()` call would be.
    const relatedActors = page.map((row) => row[joinRelation]);
    const countsByActorId = await this.countsForMany(relatedActors.map((actor) => actor.id));
    const actors = page.map((row, index) =>
      toActorProfile(relatedActors[index]!, countsByActorId.get(relatedActors[index]!.id)!),
    );
    const { nextCursor } = pageInfoFor(page, hasMore, (row) => ({
      createdAt: row.createdAt,
      id: row.id,
    }));
    return { actors, nextCursor, hasMore };
  }

  private async actorPageOf(rows: Actor[], take: number): Promise<ActorListPage> {
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const countsByActorId = await this.countsForMany(page.map((row) => row.id));
    const actors = page.map((row) => toActorProfile(row, countsByActorId.get(row.id)!));
    const { nextCursor } = pageInfoFor(page, hasMore, (row) => ({
      createdAt: row.createdAt,
      id: row.id,
    }));
    return { actors, nextCursor, hasMore };
  }

  private async countsFor(
    actorId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<ActorCountsSummary> {
    const [postCount, followerCount, followingCount] = await Promise.all([
      manager.getRepository(Post).countBy({ authorActorId: actorId, deletedAt: IsNull() }),
      manager.getRepository(Follow).countBy({ followeeActorId: actorId }),
      manager.getRepository(Follow).countBy({ followerActorId: actorId }),
    ]);
    return { followers: followerCount, following: followingCount, posts: postCount };
  }

  /**
   * Batched real counts for a page of actors (B-020: `SearchActors`/`ListFollowers`/
   * `ListFollowing` used to return zeroed `counts` placeholders). One grouped query per
   * count kind — `GROUP BY` the actor id column, filtered to just this page's ids — rather
   * than `countsFor()` per row, which would be an N+1. An actor id with no matching rows in
   * a given `GROUP BY` result (e.g. an actor with zero posts) simply never appears in that
   * query's output, so every id is pre-seeded at `{ followers: 0, following: 0, posts: 0 }`
   * before the real counts are layered on.
   */
  private async countsForMany(
    actorIds: readonly string[],
    manager: EntityManager = this.dataSource.manager,
  ): Promise<Map<string, ActorCountsSummary>> {
    const counts = new Map<string, ActorCountsSummary>(
      actorIds.map((id) => [id, { followers: 0, following: 0, posts: 0 }]),
    );
    if (actorIds.length === 0) return counts;

    const [postRows, followerRows, followingRows] = await Promise.all([
      manager
        .getRepository(Post)
        .createQueryBuilder('post')
        .select('post.authorActorId', 'actorId')
        .addSelect('COUNT(*)', 'count')
        .where('post.authorActorId IN (:...actorIds)', { actorIds })
        .andWhere('post.deletedAt IS NULL')
        .groupBy('post.authorActorId')
        .getRawMany<{ actorId: string; count: string }>(),
      manager
        .getRepository(Follow)
        .createQueryBuilder('follow')
        .select('follow.followeeActorId', 'actorId')
        .addSelect('COUNT(*)', 'count')
        .where('follow.followeeActorId IN (:...actorIds)', { actorIds })
        .groupBy('follow.followeeActorId')
        .getRawMany<{ actorId: string; count: string }>(),
      manager
        .getRepository(Follow)
        .createQueryBuilder('follow')
        .select('follow.followerActorId', 'actorId')
        .addSelect('COUNT(*)', 'count')
        .where('follow.followerActorId IN (:...actorIds)', { actorIds })
        .groupBy('follow.followerActorId')
        .getRawMany<{ actorId: string; count: string }>(),
    ]);

    // `COUNT(*)` comes back as a string (the `pg` driver never assumes bigint fits a JS
    // number) — same reasoning as `outbox_jobs.id`, see docs/research/typeorm-postgres.md §7.
    for (const row of postRows) {
      const existing = counts.get(row.actorId);
      if (existing !== undefined) existing.posts = Number(row.count);
    }
    for (const row of followerRows) {
      const existing = counts.get(row.actorId);
      if (existing !== undefined) existing.followers = Number(row.count);
    }
    for (const row of followingRows) {
      const existing = counts.get(row.actorId);
      if (existing !== undefined) existing.following = Number(row.count);
    }
    return counts;
  }
}

/**
 * Builds the `actors.nameplate` JSON record from a validated client patch, merged against the
 * actor's *existing* record for `badges` only. `badges` is server-attested (spec §173): every
 * write here discards whatever the client sent for it (the schema does not even parse a
 * `badges` field — see `nameplateInputSchema`) and instead carries the actor's current badges
 * forward unchanged, so `UpdateProfile` can never be used to self-assign one.
 */
function buildNameplateRecord(
  input: NameplateInput,
  existing: Record<string, unknown> | null,
): Record<string, unknown> {
  const existingBadges = Array.isArray(existing?.badges)
    ? existing.badges.filter((badge): badge is string => typeof badge === 'string')
    : [];

  const record: Record<string, unknown> = {
    nameColor: input.nameColor ?? '',
    glyph: input.glyph ?? '',
    badges: existingBadges,
    avatarFrame: input.avatarFrame ?? '',
    statusLine: input.statusLine ?? '',
    profileBorder: input.profileBorder ?? '',
  };

  const byteSize = Buffer.byteLength(JSON.stringify(record), 'utf8');
  if (byteSize > NAMEPLATE_MAX_BYTES) {
    throw AppError.validation(`nameplate must be at most ${String(NAMEPLATE_MAX_BYTES)} bytes.`);
  }
  return record;
}

function actorNotFound(): AppError {
  return new AppError('ACTOR_NOT_FOUND', 'That actor does not exist.');
}

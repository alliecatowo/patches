import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Actor, Post } from '@patches/database';
import { DataSource, IsNull } from 'typeorm';

import { AppConfigService } from '../../../config/app-config.service.js';
import { AppError } from '../../../common/errors/app-error.js';
import { decodeCursor, encodeCursor } from '../../feeds/pagination.js';
import {
  buildOutboxCollection,
  buildOutboxPage,
  buildNoteObject,
  type ActivityStreamsDocument,
} from '../activitystreams/documents.js';
import {
  localActorFollowersUri,
  localActorOutboxPageUri,
  localActorOutboxUri,
  localActorUri,
  localPostUri,
} from '../activitystreams/uris.js';

/** Keyset page size (B-027). Same `(created_at DESC, id DESC)` ordering as every other
 * keyset-paginated list in this codebase (`.claude/rules/database.md`). */
const OUTBOX_PAGE_SIZE = 20;

/** The AS2/AP convention (Mastodon and others) for "the first page, no cursor to decode yet" —
 * `first` always points here rather than at an empty `?page=` query string. */
export const OUTBOX_FIRST_PAGE_MARKER = 'true';

export type OutboxRejectionReason = 'INVALID_CURSOR' | 'UNKNOWN_ACTOR';

export type OutboxResult =
  | { readonly found: true; readonly document: ActivityStreamsDocument }
  | { readonly found: false; readonly reason: OutboxRejectionReason };

@Injectable()
export class OutboxCollectionService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: AppConfigService,
  ) {}

  /** `GET /users/:handle/outbox[?page=…]` (P8-002, B-027) end to end — the `OrderedCollection`
   * summary ({@link buildCollection}) or one keyset page ({@link buildPage}) when `page` is
   * present, with a malformed `page` cursor surfaced as a client error instead of a thrown
   * `AppError`. Statuses stay in the controller. */
  async resolve(handle: string, page: string | undefined): Promise<OutboxResult> {
    const handleNormalized = handle.toLowerCase();
    let document: ActivityStreamsDocument | undefined;
    try {
      document =
        page === undefined
          ? await this.buildCollection(handleNormalized)
          : await this.buildPage(handleNormalized, page);
    } catch (error) {
      if (error instanceof AppError && error.code === 'VALIDATION_ERROR') {
        return { found: false, reason: 'INVALID_CURSOR' };
      }
      throw error;
    }
    return document === undefined
      ? { found: false, reason: 'UNKNOWN_ACTOR' }
      : { found: true, document };
  }

  /** `GET /users/:handle/outbox` (P8-002, B-027) — the `OrderedCollection` summary
   * (`totalItems` + a `first` link into {@link buildPage}). `undefined` if no local actor has
   * this handle. */
  async buildCollection(handleNormalized: string): Promise<ActivityStreamsDocument | undefined> {
    const actor = await this.findLocalActor(handleNormalized);
    if (actor === undefined) return undefined;

    const origin = this.config.publicOrigin;
    const totalItems = await this.dataSource.getRepository(Post).count({
      where: { authorActorId: actor.id, visibility: 'PUBLIC', deletedAt: IsNull() },
    });
    return buildOutboxCollection(
      localActorOutboxUri(origin, actor.handleNormalized),
      totalItems,
      localActorOutboxPageUri(origin, actor.handleNormalized, OUTBOX_FIRST_PAGE_MARKER),
    );
  }

  /** `GET /users/:handle/outbox?page=…` (B-027) — one keyset `OrderedCollectionPage` of
   * `Create(Note)`-shaped post objects, newest first. `pageParam` is either {@link
   * OUTBOX_FIRST_PAGE_MARKER} or an opaque cursor this same method previously minted into a
   * `next` link. `undefined` if no local actor has this handle; throws `AppError.validation`
   * (via `decodeCursor`) for a malformed cursor. */
  async buildPage(
    handleNormalized: string,
    pageParam: string,
  ): Promise<ActivityStreamsDocument | undefined> {
    const actor = await this.findLocalActor(handleNormalized);
    if (actor === undefined) return undefined;

    const cursor = pageParam === OUTBOX_FIRST_PAGE_MARKER ? undefined : decodeCursor(pageParam);
    const qb = this.dataSource
      .getRepository(Post)
      .createQueryBuilder('post')
      .where('post.authorActorId = :actorId', { actorId: actor.id })
      .andWhere('post.visibility = :visibility', { visibility: 'PUBLIC' })
      .andWhere('post.deletedAt IS NULL')
      .orderBy('post.createdAt', 'DESC')
      .addOrderBy('post.id', 'DESC')
      .take(OUTBOX_PAGE_SIZE + 1);
    if (cursor !== undefined) {
      qb.andWhere('(post.createdAt, post.id) < (:cursorCreatedAt, :cursorId)', {
        cursorCreatedAt: cursor.createdAt,
        cursorId: cursor.id,
      });
    }
    const rows = await qb.getMany();
    const hasMore = rows.length > OUTBOX_PAGE_SIZE;
    const page = hasMore ? rows.slice(0, OUTBOX_PAGE_SIZE) : rows;

    const origin = this.config.publicOrigin;
    const actorUri = localActorUri(origin, actor.handleNormalized);
    const items = page.map((post) =>
      buildNoteObject({
        id: localPostUri(origin, post.id),
        attributedTo: actorUri,
        content: post.body ?? '',
        published: post.createdAt,
        inReplyTo: null,
        followersUri: localActorFollowersUri(origin, actor.handleNormalized),
      }),
    );

    const last = page.at(-1);
    const next =
      hasMore && last !== undefined
        ? localActorOutboxPageUri(
            origin,
            actor.handleNormalized,
            encodeCursor({ createdAt: last.createdAt, id: last.id }),
          )
        : undefined;

    return buildOutboxPage({
      id: localActorOutboxPageUri(origin, actor.handleNormalized, pageParam),
      partOf: localActorOutboxUri(origin, actor.handleNormalized),
      items,
      next,
    });
  }

  private async findLocalActor(handleNormalized: string): Promise<Actor | undefined> {
    const actor = await this.dataSource
      .getRepository(Actor)
      .findOne({ where: { handleNormalized, isLocal: true } });
    return actor === null || actor.deletedAt !== null ? undefined : actor;
  }
}

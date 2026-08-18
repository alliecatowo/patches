import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Actor, Post } from '@patches/database';
import { DataSource, IsNull } from 'typeorm';

import { AppConfigService } from '../../../config/app-config.service.js';
import {
  buildOutboxCollection,
  buildNoteObject,
  type ActivityStreamsDocument,
} from '../activitystreams/documents.js';
import {
  localActorFollowersUri,
  localActorOutboxUri,
  localActorUri,
  localPostUri,
} from '../activitystreams/uris.js';

/** Newest-N public posts, not true keyset pagination — a documented v0.1 simplification
 * (`docs/architecture/federation.md`'s readiness checklist still lists real outbox paging as
 * open; see this task's report). */
const OUTBOX_PAGE_SIZE = 20;

@Injectable()
export class OutboxCollectionService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: AppConfigService,
  ) {}

  /** `GET /users/:handle/outbox` (P8-002) — an `OrderedCollection` of `Create(Note)`
   * activities for the actor's public posts, newest first. `undefined` if no local actor has
   * this handle. */
  async buildOutbox(handleNormalized: string): Promise<ActivityStreamsDocument | undefined> {
    const actor = await this.dataSource
      .getRepository(Actor)
      .findOne({ where: { handleNormalized, isLocal: true } });
    if (actor === null || actor.deletedAt !== null) return undefined;

    const origin = this.config.publicOrigin;
    const [posts, totalItems] = await this.dataSource.getRepository(Post).findAndCount({
      where: { authorActorId: actor.id, visibility: 'PUBLIC', deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
      take: OUTBOX_PAGE_SIZE,
    });

    const actorUri = localActorUri(origin, actor.handleNormalized);
    const items = posts.map((post) =>
      buildNoteObject({
        id: localPostUri(origin, post.id),
        attributedTo: actorUri,
        content: post.body ?? '',
        published: post.createdAt,
        inReplyTo: null,
        followersUri: localActorFollowersUri(origin, actor.handleNormalized),
      }),
    );
    return buildOutboxCollection(
      localActorOutboxUri(origin, actor.handleNormalized),
      totalItems,
      items,
    );
  }
}

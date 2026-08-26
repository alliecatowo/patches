import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Actor, Page } from '@patches/database';
import { DataSource } from 'typeorm';

import { AppConfigService } from '../../../config/app-config.service.js';
import { buildActorDocument, type ActivityStreamsDocument } from '../activitystreams/documents.js';
import { acceptsActivityJson } from '../http/content-negotiation.js';
import { KeyService } from './key.service.js';

export type ActorDocumentRejectionReason = 'NOT_ACCEPTABLE' | 'UNKNOWN_ACTOR';

export type ActorDocumentResult =
  | { readonly found: true; readonly document: ActivityStreamsDocument }
  | { readonly found: false; readonly reason: ActorDocumentRejectionReason };

/** `docs/architecture/federation.md` §7.5 (P8-007): the Page manifest URL this node exposes
 * for an actor's Page, when it has a public one. Content lives on `PageRevision.document`
 * (`packages/domain`'s `PatchesPage` shape) — this federation surface only ever links to it,
 * never re-serializes it into AS2. */
export function localPageUri(origin: string, handleNormalized: string): string {
  return `${origin}/users/${encodeURIComponent(handleNormalized)}/page`;
}

@Injectable()
export class ActorDocumentService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: AppConfigService,
    private readonly keys: KeyService,
  ) {}

  /** `GET /users/:handle` (P8-001) end to end: not-acceptable when the request's `Accept`
   * header can't be satisfied by an AS2 JSON representation, unknown-actor when no local,
   * non-deleted actor has the (normalized) handle, the actor document otherwise. Statuses
   * stay in the controller. */
  async resolveForRequest(
    handle: string,
    accept: string | undefined,
  ): Promise<ActorDocumentResult> {
    if (!acceptsActivityJson(accept)) return { found: false, reason: 'NOT_ACCEPTABLE' };
    const document = await this.buildForHandle(handle.toLowerCase());
    return document === undefined
      ? { found: false, reason: 'UNKNOWN_ACTOR' }
      : { found: true, document };
  }

  /** `GET /users/:handle` (P8-001). `undefined` if no local, non-deleted actor has this
   * (normalized) handle. */
  buildForHandle(handleNormalized: string): Promise<ActivityStreamsDocument | undefined> {
    return this.dataSource.transaction(async (manager) => {
      const actor = await manager
        .getRepository(Actor)
        .findOne({ where: { handleNormalized, isLocal: true } });
      if (actor === null || actor.deletedAt !== null) return undefined;

      const { publicKeyPem } = await this.keys.getOrCreateKeyPair(manager, actor.id);
      const page = await manager
        .getRepository(Page)
        .findOne({ where: { actorId: actor.id, visibility: 'PUBLIC' } });

      return buildActorDocument(this.config.publicOrigin, {
        handleNormalized: actor.handleNormalized,
        displayName: actor.displayName,
        bio: actor.bio,
        publicKeyPem,
        ...(page === null
          ? {}
          : {
              pageManifest: [
                {
                  slug: actor.handleNormalized,
                  url: localPageUri(this.config.publicOrigin, actor.handleNormalized),
                },
              ],
            }),
      });
    });
  }
}

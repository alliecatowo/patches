import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Actor, Page } from '@patches/database';
import { DataSource } from 'typeorm';

import { AppConfigService } from '../../../config/app-config.service.js';
import { buildActorDocument, type ActivityStreamsDocument } from '../activitystreams/documents.js';
import { KeyService } from './key.service.js';

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

  /** `GET /users/:handle` (P8-001). `undefined` if no local, non-deleted actor has this
   * (normalized) handle. */
  async buildForHandle(handleNormalized: string): Promise<ActivityStreamsDocument | undefined> {
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

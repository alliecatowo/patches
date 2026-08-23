import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Actor } from '@patches/database';
import { DataSource } from 'typeorm';

import { AppConfigService } from '../../../config/app-config.service.js';
import { buildWebfingerJrd } from '../activitystreams/documents.js';
import { localActorUri } from '../activitystreams/uris.js';

const RESOURCE_PATTERN = /^acct:([^@]+)(?:@(.+))?$/i;

@Injectable()
export class WebfingerService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: AppConfigService,
  ) {}

  /** `GET /.well-known/webfinger?resource=acct:handle@domain` (RFC 7033, P8-001). `undefined`
   * for a malformed resource, a domain this node does not answer for, or an unknown/deleted
   * local actor — every case renders as a plain `404`, never leaking which one. */
  async resolve(
    resource: string,
  ): Promise<{ subject: string; links: unknown[]; aliases?: string[] } | undefined> {
    const match = RESOURCE_PATTERN.exec(resource);
    if (match === null) return undefined;
    const [, handle, domain] = match;
    if (handle === undefined) return undefined;
    if (domain !== undefined && domain.toLowerCase() !== this.nodeHost()) return undefined;

    const actor = await this.dataSource
      .getRepository(Actor)
      .findOne({ where: { handleNormalized: handle.toLowerCase(), isLocal: true } });
    if (actor === null || actor.deletedAt !== null) return undefined;

    const actorUri = localActorUri(this.config.publicOrigin, actor.handleNormalized);
    const jrd = buildWebfingerJrd(`${actor.handleNormalized}@${this.nodeHost()}`, actorUri);
    return {
      ...jrd,
      aliases: [actorUri],
    };
  }

  private nodeHost(): string {
    return new URL(this.config.publicOrigin).host;
  }
}

import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Actor } from '@patches/database';
import { DataSource } from 'typeorm';

import { AppConfigService } from '../../../config/app-config.service.js';
import { buildWebfingerJrd } from '../activitystreams/documents.js';
import { localActorUri } from '../activitystreams/uris.js';

const RESOURCE_PATTERN = /^acct:([^@]+)(?:@(.+))?$/i;

/** The JRD this node emits for a local actor — `buildWebfingerJrd`'s document plus the actor
 * URI in `aliases`. */
export interface WebfingerJrd {
  subject: string;
  links: unknown[];
  aliases?: string[];
}

export type WebfingerRejectionReason = 'MISSING_RESOURCE' | 'UNKNOWN_RESOURCE';

export type WebfingerResult =
  | { readonly resolved: true; readonly jrd: WebfingerJrd }
  | { readonly resolved: false; readonly reason: WebfingerRejectionReason };

@Injectable()
export class WebfingerService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: AppConfigService,
  ) {}

  /** `GET /.well-known/webfinger?resource=acct:handle@domain` (RFC 7033, P8-001). `undefined`
   * for a malformed resource, a domain this node does not answer for, or an unknown/deleted
   * local actor — every case renders as a plain `404`, never leaking which one. */
  async resolve(resource: string): Promise<WebfingerJrd | undefined> {
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

  /** `GET /.well-known/webfinger` (RFC 7033, P8-001) end to end: a request without a
   * `resource` parameter is a client error; every unresolvable resource — malformed, wrong
   * domain, unknown/deleted actor ({@link resolve}) — is the same plain not-found, never
   * leaking which one. Statuses stay in the controller. */
  async resolveResource(resource: string | undefined): Promise<WebfingerResult> {
    if (resource === undefined) return { resolved: false, reason: 'MISSING_RESOURCE' };
    const jrd = await this.resolve(resource);
    return jrd === undefined
      ? { resolved: false, reason: 'UNKNOWN_RESOURCE' }
      : { resolved: true, jrd };
  }

  private nodeHost(): string {
    return new URL(this.config.publicOrigin).host;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Actor } from '@patches/database';
import type { EntityManager } from 'typeorm';

import { AppConfigService } from '../../../config/app-config.service.js';
import { parseBoundedJson } from '../security/bounded-json.js';
import { defaultSafeFetchPolicy, safeFetch } from '../security/safe-fetch.js';
import { ACTIVITY_JSON_CONTENT_TYPE, JRD_JSON_CONTENT_TYPE } from '../federation.constants.js';

export class RemoteFetchError extends Error {}

interface RemoteActorDocument {
  id: string;
  preferredUsername?: string;
  inbox: string;
  endpoints?: { sharedInbox?: string };
  publicKey?: { publicKeyPem?: string };
}

/**
 * Discovers and caches remote actors (P8-002, §110's "Remote actor" persistence mapping).
 * Every remote actor is a plain `actors` row with `is_local = false` — there is no separate
 * remote-actor table, matching the spec's "future remote entities fit existing tables"
 * instruction.
 */
@Injectable()
export class RemoteActorService {
  private readonly logger = new Logger(RemoteActorService.name);

  constructor(private readonly config: AppConfigService) {}

  /** WebFinger discovery (`acct:handle@domain` -> actor URI) followed by an actor-document
   * fetch (P8-001/P8-002). */
  async resolveByAcct(manager: EntityManager, handle: string, domain: string): Promise<Actor> {
    const scheme = this.config.isProduction ? 'https' : 'http';
    const resource = `acct:${handle}@${domain}`;
    const webfingerUrl = `${scheme}://${domain}/.well-known/webfinger?resource=${encodeURIComponent(resource)}`;

    const response = await safeFetch(webfingerUrl, {
      headers: { accept: JRD_JSON_CONTENT_TYPE },
      policy: defaultSafeFetchPolicy(this.config.isProduction),
    });
    if (response.status !== 200) {
      throw new RemoteFetchError(
        `WebFinger lookup for "${resource}" failed (${String(response.status)}).`,
      );
    }
    const jrd = parseBoundedJson(response.body.toString('utf8')) as {
      links?: { rel?: string; type?: string; href?: string }[];
    };
    const selfLink = (jrd.links ?? []).find(
      (link) => link.rel === 'self' && link.href !== undefined,
    );
    if (selfLink?.href === undefined) {
      throw new RemoteFetchError(`WebFinger response for "${resource}" has no "self" link.`);
    }
    return this.getOrFetchByUri(manager, selfLink.href);
  }

  /**
   * Looks up a cached remote actor by its canonical URI, fetching (and caching) it if
   * missing or `forceRefetch` is set — the latter is what P8-005's "refetch remote actor's
   * key on verification failure" uses when a cached `publicKeyPem` no longer verifies (the
   * remote actor may have rotated its key).
   */
  async getOrFetchByUri(
    manager: EntityManager,
    actorUri: string,
    options: { forceRefetch?: boolean } = {},
  ): Promise<Actor> {
    const repository = manager.getRepository(Actor);
    const existing = await repository.findOne({ where: { canonicalUri: actorUri } });
    if (existing !== null && options.forceRefetch !== true) return existing;

    const document = await this.fetchActorDocument(actorUri);
    return this.upsertRemoteActor(manager, document, existing);
  }

  private async fetchActorDocument(actorUri: string): Promise<RemoteActorDocument> {
    const response = await safeFetch(actorUri, {
      headers: { accept: ACTIVITY_JSON_CONTENT_TYPE },
      policy: defaultSafeFetchPolicy(this.config.isProduction),
    });
    if (response.status !== 200) {
      throw new RemoteFetchError(
        `Actor fetch for "${actorUri}" failed (${String(response.status)}).`,
      );
    }
    const parsed = parseBoundedJson(response.body.toString('utf8')) as Partial<RemoteActorDocument>;
    if (parsed.id === undefined || parsed.inbox === undefined) {
      throw new RemoteFetchError(`Actor document at "${actorUri}" is missing id/inbox.`);
    }
    return parsed as RemoteActorDocument;
  }

  private async upsertRemoteActor(
    manager: EntityManager,
    document: RemoteActorDocument,
    existing: Actor | null,
  ): Promise<Actor> {
    const repository = manager.getRepository(Actor);
    const homeServer = safeHostOf(document.id);
    const handle = document.preferredUsername ?? existing?.handle ?? document.id;
    const handleNormalized = `${handle.toLowerCase()}@${homeServer}`;

    if (existing !== null) {
      await repository.update(
        { id: existing.id },
        {
          handle,
          inboxUri: document.inbox,
          sharedInboxUri: document.endpoints?.sharedInbox ?? null,
          publicKeyPem: document.publicKey?.publicKeyPem ?? null,
          lastFetchedAt: new Date(),
        },
      );
      return repository.findOneOrFail({ where: { id: existing.id } });
    }

    this.logger.log(JSON.stringify({ event: 'remote_actor_discovered', uri: document.id }));
    const created = repository.create({
      userId: null,
      handle,
      handleNormalized,
      clientRequestId: null,
      isLocal: false,
      homeServer,
      canonicalUri: document.id,
      inboxUri: document.inbox,
      sharedInboxUri: document.endpoints?.sharedInbox ?? null,
      publicKeyPem: document.publicKey?.publicKeyPem ?? null,
      outboxUri: null,
      federationState: null,
      lastFetchedAt: new Date(),
    });
    return repository.save(created);
  }
}

function safeHostOf(uri: string): string {
  try {
    return new URL(uri).host;
  } catch {
    throw new RemoteFetchError(`"${uri}" is not a valid actor URI.`);
  }
}

import { Injectable } from '@nestjs/common';
import {
  federationDeliverPayloadSchema,
  OutboxJob,
  type FederationDeliverPayload,
} from '@patches/database';
import type { EntityManager } from 'typeorm';

import type { ActivityStreamsDocument } from '../activitystreams/documents.js';
import { FederationMetricsService } from '../federation-metrics.service.js';
import { DomainBlockService } from './domain-block.service.js';

/** Outbound-delivery max attempts before a `FEDERATION_DELIVER` job dead-letters
 * (`docs/architecture/jobs.md` §5-6) — generous relative to email jobs since a remote
 * instance being briefly unreachable is the common case, not the exception. */
const FEDERATION_DELIVER_MAX_ATTEMPTS = 12;

/**
 * Enqueues durable `FEDERATION_DELIVER` jobs (P8-004) — the only way any AS2 activity this
 * node originates ever reaches a remote inbox. Always called with the caller's transactional
 * `EntityManager` so the enqueue commits atomically with whatever local write triggered it
 * (a new post, a follow, a like) — the same "write + queue in one transaction" pattern every
 * other outbox job in this codebase already follows.
 */
@Injectable()
export class DeliveryService {
  constructor(
    private readonly metrics: FederationMetricsService,
    private readonly domainBlocks: DomainBlockService,
  ) {}

  /**
   * One job per unique inbox URL (shared-inbox deduped) — `activity` must already have a
   * unique `id` (`ActivityIdService`). Idempotency key is `(activityId, inboxUrl)`
   * (`federationDeliverPayloadSchema`'s doc comment) so re-enqueuing the same activity to the
   * same inbox (e.g. a retried caller) is a no-op, not a duplicate delivery.
   *
   * Inbox URLs whose host is in `domain_blocks` are silently dropped before anything is
   * enqueued (B-027, P8-006's "no outbound delivery is ever attempted to it" — see
   * `DomainBlockService`'s doc comment for the worker-side re-check that closes the other
   * half of this).
   */
  async enqueue(
    manager: EntityManager,
    params: { actorId: string; activity: ActivityStreamsDocument; inboxUrls: readonly string[] },
  ): Promise<void> {
    const activityId = params.activity.id;
    if (typeof activityId !== 'string' || activityId.length === 0) {
      throw new Error('DeliveryService.enqueue: activity is missing an id.');
    }
    const uniqueInboxes = await this.filterBlockedInboxes(manager, [...new Set(params.inboxUrls)]);
    const repository = manager.getRepository(OutboxJob);

    for (const inboxUrl of uniqueInboxes) {
      const payload: FederationDeliverPayload = federationDeliverPayloadSchema.parse({
        activityId,
        inboxUrl,
        actorId: params.actorId,
        activity: params.activity,
      });
      try {
        await repository.save(
          repository.create({
            type: 'FEDERATION_DELIVER',
            payload,
            maxAttempts: FEDERATION_DELIVER_MAX_ATTEMPTS,
            idempotencyKey: `federation-deliver:${activityId}:${inboxUrl}`,
          }),
        );
        this.metrics.increment('deliveries_enqueued', { domain: hostOf(inboxUrl) });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
  }

  /** Drops any inbox whose host is domain-blocked. An unparseable `inboxUrl` is dropped too
   * (matches `hostOf`'s "never throws" contract by treating an unparseable URL as unsafe
   * rather than silently keeping it). */
  private async filterBlockedInboxes(
    manager: EntityManager,
    inboxUrls: readonly string[],
  ): Promise<string[]> {
    const kept: string[] = [];
    // Sequential, one small indexed lookup per inbox: a batched IN-query would only help for
    // actors with many more remote followers than the two-node lab ever has.
    for (const inboxUrl of inboxUrls) {
      const host = hostOf(inboxUrl);
      const blocked = host === undefined ? true : await this.domainBlocks.isBlocked(manager, host);
      if (!blocked) kept.push(inboxUrl);
    }
    return kept;
  }
}

/** Best-effort label only — an unparseable `inboxUrl` would already have failed
 * `federationDeliverPayloadSchema.parse` above, so this never actually throws in practice. */
function hostOf(inboxUrl: string): string | undefined {
  try {
    return new URL(inboxUrl).host;
  } catch {
    return undefined;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

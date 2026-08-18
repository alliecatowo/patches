import { Injectable } from '@nestjs/common';
import {
  federationDeliverPayloadSchema,
  OutboxJob,
  type FederationDeliverPayload,
} from '@patches/database';
import type { EntityManager } from 'typeorm';

import type { ActivityStreamsDocument } from '../activitystreams/documents.js';
import { FederationMetricsService } from '../federation-metrics.service.js';

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
  constructor(private readonly metrics: FederationMetricsService) {}

  /**
   * One job per unique inbox URL (shared-inbox deduped) — `activity` must already have a
   * unique `id` (`ActivityIdService`). Idempotency key is `(activityId, inboxUrl)`
   * (`federationDeliverPayloadSchema`'s doc comment) so re-enqueuing the same activity to the
   * same inbox (e.g. a retried caller) is a no-op, not a duplicate delivery.
   */
  async enqueue(
    manager: EntityManager,
    params: { actorId: string; activity: ActivityStreamsDocument; inboxUrls: readonly string[] },
  ): Promise<void> {
    const activityId = params.activity.id;
    if (typeof activityId !== 'string' || activityId.length === 0) {
      throw new Error('DeliveryService.enqueue: activity is missing an id.');
    }
    const uniqueInboxes = [...new Set(params.inboxUrls)];
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

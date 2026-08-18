import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  Actor,
  FederationKey,
  federationDeliverPayloadSchema,
  type JobType,
} from '@patches/database';
import type { DataSource } from 'typeorm';

import { AppConfigService } from '../../config/app-config.service.js';
import { DATA_SOURCE } from '../../database/database.module.js';
import {
  computeDigestHeader,
  defaultSafeFetchPolicy,
  safeFetch,
  signRequest,
} from '../../federation/delivery-client.js';
import { ACTIVITY_JSON_CONTENT_TYPE } from '../../federation/federation.constants.js';
import { type JobContext, type JobHandler } from '../job-handler.js';

/** Terminal (never retried) delivery outcomes — the receiving inbox told us clearly enough
 * that retrying with the exact same activity will never succeed. Everything else (network
 * errors, 5xx, timeouts) is retryable and left to throw so `JobRunner`'s existing backoff/
 * dead-letter path (`markOutboxJobFailed`) handles it, same as every other job type. */
const TERMINAL_STATUS_CODES = new Set([400, 401, 403, 404, 410, 422]);

/**
 * `FEDERATION_DELIVER` (P8-004, P8-005): signs (`draft-cavage-http-signatures-12`) and POSTs
 * one already-built AS2 activity to one inbox URL. Idempotent by construction — the
 * `(activityId, inboxUrl)` pair is the job's own idempotency key (`DeliveryService`), and
 * re-delivering the same activity to the same inbox is exactly what a retry does, which is
 * safe because inbox-side dedupe (`InboxActivity`, P8-006) makes a duplicate delivery a no-op
 * for the receiver.
 */
@Injectable()
export class FederationDeliverHandler implements JobHandler {
  readonly type: JobType = 'FEDERATION_DELIVER';
  private readonly logger = new Logger(FederationDeliverHandler.name);

  constructor(
    @Inject(DATA_SOURCE) private readonly dataSource: DataSource,
    private readonly config: AppConfigService,
  ) {}

  async handle(payload: unknown, _ctx: JobContext): Promise<void> {
    const { actorId, inboxUrl, activity, activityId } =
      federationDeliverPayloadSchema.parse(payload);

    const [actor, key] = await Promise.all([
      this.dataSource.getRepository(Actor).findOne({ where: { id: actorId } }),
      this.dataSource.getRepository(FederationKey).findOne({ where: { actorId } }),
    ]);
    if (actor === null || key === null) {
      // Permanent — the signing actor or its keypair is gone (e.g. account deletion raced
      // this delivery). Retrying can never produce a signer, so this is a no-op completion,
      // matching `ProcessMediaHandler`'s "the row is gone" precedent.
      this.logger.warn(JSON.stringify({ activityId, outcome: 'SIGNER_MISSING' }));
      return;
    }

    const body = JSON.stringify(activity);
    const target = new URL(inboxUrl);
    const date = new Date().toUTCString();
    const digest = computeDigestHeader(body);
    const keyId = `${this.config.publicOrigin}/users/${actor.handleNormalized}#main-key`;
    const signature = signRequest({
      method: 'POST',
      target: `${target.pathname}${target.search}`,
      host: target.host,
      date,
      digest,
      keyId,
      privateKeyPem: key.privateKeyPem,
    });

    const response = await safeFetch(inboxUrl, {
      method: 'POST',
      headers: {
        host: target.host,
        date,
        digest,
        signature,
        'content-type': ACTIVITY_JSON_CONTENT_TYPE,
        accept: ACTIVITY_JSON_CONTENT_TYPE,
      },
      body,
      policy: defaultSafeFetchPolicy(this.config.isProduction),
    });

    if (response.status >= 200 && response.status < 300) return;
    if (TERMINAL_STATUS_CODES.has(response.status)) {
      this.logger.warn(
        JSON.stringify({
          activityId,
          inboxUrl,
          status: response.status,
          outcome: 'REJECTED_TERMINAL',
        }),
      );
      return;
    }
    throw new Error(`Delivery to "${inboxUrl}" failed with status ${String(response.status)}.`);
  }
}

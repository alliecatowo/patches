import { Injectable } from '@nestjs/common';
import { RATE_LIMITS } from '@patches/domain';

import {
  enforceWindowPeerRateLimit,
  enforceWindowRateLimit,
} from '../../common/rate-limit/window-rate-limiter.js';
import { DbRateLimitStore } from '../auth/db-rate-limit-store.service.js';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Coarser ceiling for the peer-keyed budget than the per-actor one — a peer address can be
 * many legitimate callers behind one NAT/proxy (same reasoning as `rate-limit.service.ts`'s
 * `PEER_WINDOWS`, which are consistently more generous than their subject counterparts). */
const PEER_MULTIPLIER = 5;

/**
 * Database-backed, per-actor **and** per-peer rate limiting for `DirectMessageService`'s two
 * abuse-sensitive write paths (spec §102, §188): message sends and message requests. Built on
 * the shared `enforceWindowRateLimit`/`enforceWindowPeerRateLimit` helpers (`common/rate-
 * limit/window-rate-limiter.ts`) rather than `modules/auth/rate-limit.service.ts`'s in-memory,
 * closed-`RateLimitAction` `RateLimitService` — DM abuse limits must survive a process restart
 * and be shared across every server process from the start (§188's preamble: "what MUST NOT
 * happen is a new write path shipping with no limit at all").
 */
@Injectable()
export class DmRateLimitService {
  constructor(private readonly store: DbRateLimitStore) {}

  /** §188: DM send, 20/minute and 300/hour, per actor and per peer. */
  async consumeSend(actorId: string, peer: string | undefined, now = new Date()): Promise<void> {
    await enforceWindowRateLimit(
      this.store,
      'dm_send_minute',
      actorId,
      RATE_LIMITS.dmSendPerMinute,
      MINUTE_MS,
      now,
    );
    await enforceWindowPeerRateLimit(
      this.store,
      'dm_send_minute',
      peer,
      RATE_LIMITS.dmSendPerMinute * PEER_MULTIPLIER,
      MINUTE_MS,
      now,
    );
    await enforceWindowRateLimit(
      this.store,
      'dm_send_hour',
      actorId,
      RATE_LIMITS.dmSendPerHour,
      HOUR_MS,
      now,
    );
    await enforceWindowPeerRateLimit(
      this.store,
      'dm_send_hour',
      peer,
      RATE_LIMITS.dmSendPerHour * PEER_MULTIPLIER,
      HOUR_MS,
      now,
    );
  }

  /** §188: message requests, 5/hour and 20/day, per actor and per peer. */
  async consumeMessageRequest(
    actorId: string,
    peer: string | undefined,
    now = new Date(),
  ): Promise<void> {
    await enforceWindowRateLimit(
      this.store,
      'dm_request_hour',
      actorId,
      RATE_LIMITS.messageRequestPerHour,
      HOUR_MS,
      now,
    );
    await enforceWindowPeerRateLimit(
      this.store,
      'dm_request_hour',
      peer,
      RATE_LIMITS.messageRequestPerHour * PEER_MULTIPLIER,
      HOUR_MS,
      now,
    );
    await enforceWindowRateLimit(
      this.store,
      'dm_request_day',
      actorId,
      RATE_LIMITS.messageRequestPerDay,
      DAY_MS,
      now,
    );
    await enforceWindowPeerRateLimit(
      this.store,
      'dm_request_day',
      peer,
      RATE_LIMITS.messageRequestPerDay * PEER_MULTIPLIER,
      DAY_MS,
      now,
    );
  }
}

import { Injectable } from '@nestjs/common';

import {
  enforceWindowPeerRateLimit,
  enforceWindowRateLimit,
} from '../../common/rate-limit/window-rate-limiter.js';
import { DbRateLimitStore } from '../auth/db-rate-limit-store.service.js';

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

/** Follow requests created (not ordinary immediate follows), per actor. Starting values — not
 * named in `INITIAL_VISION.md` §204's table, but §197.5's "rate-limited" requirement still
 * applies (same "no new write path ships with no limit at all" reasoning `DmRateLimitService`
 * documents for message requests, whose per-hour/per-day shape this mirrors). */
const REQUESTS_PER_HOUR = 20;
const REQUESTS_PER_DAY = 100;

/** Coarser ceiling for the peer-keyed budget than the per-actor one — a peer address can be
 * many legitimate callers behind one NAT/proxy (same reasoning as `rate-limit.service.ts`'s
 * `PEER_WINDOWS`). */
const PEER_MULTIPLIER = 5;

/**
 * Database-backed, per-actor **and** per-peer rate limiting for `SocialGraphService.FollowActor`
 * against a locked actor (spec §197.5) — built on the same shared `enforceWindowRateLimit`/
 * `enforceWindowPeerRateLimit` helpers `DmRateLimitService` uses for message requests, rather
 * than joining `modules/auth/rate-limit.service.ts`'s in-memory, closed-`RateLimitAction`
 * union: a follow-request budget must survive a process restart and be shared across every
 * server process from the start, same as a message request's.
 */
@Injectable()
export class FollowRequestRateLimitService {
  constructor(private readonly store: DbRateLimitStore) {}

  async consume(actorId: string, peer: string | undefined, now = new Date()): Promise<void> {
    await enforceWindowRateLimit(
      this.store,
      'follow_request_hour',
      actorId,
      REQUESTS_PER_HOUR,
      HOUR_MS,
      now,
    );
    await enforceWindowPeerRateLimit(
      this.store,
      'follow_request_hour',
      peer,
      REQUESTS_PER_HOUR * PEER_MULTIPLIER,
      HOUR_MS,
      now,
    );
    await enforceWindowRateLimit(
      this.store,
      'follow_request_day',
      actorId,
      REQUESTS_PER_DAY,
      DAY_MS,
      now,
    );
    await enforceWindowPeerRateLimit(
      this.store,
      'follow_request_day',
      peer,
      REQUESTS_PER_DAY * PEER_MULTIPLIER,
      DAY_MS,
      now,
    );
  }
}

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

/** Coarser ceiling for the peer-keyed budget than the per-actor one — same reasoning as
 * `DmRateLimitService`'s `PEER_MULTIPLIER`: a peer address can be many legitimate callers
 * behind one NAT/proxy. */
const PEER_MULTIPLIER = 5;

/** Report evidence disclosures, per actor, per hour — matched to `ReportRateLimitService`'s
 * 10/hour report budget, since each disclosure belongs to a report the caller filed. */
const REPORT_EVIDENCE_PER_HOUR = 10;

interface WindowBudget {
  readonly windowMs: number;
  readonly limit: number;
}

/** A send is a send: an envelope fanout and a conversation creation both persist exactly one
 * logical message, so they share the §188 DM-send budgets (20/minute, 300/hour). */
const ENVELOPE_BUDGETS: readonly WindowBudget[] = [
  { windowMs: MINUTE_MS, limit: RATE_LIMITS.dmSendPerMinute },
  { windowMs: HOUR_MS, limit: RATE_LIMITS.dmSendPerHour },
];

/** Membership transitions are rare by design (device-signed events), so they get the §188
 * first-contact-shaped budgets rather than the send ones. */
const GROUP_CONTROL_BUDGETS: readonly WindowBudget[] = [
  { windowMs: HOUR_MS, limit: RATE_LIMITS.messageRequestPerHour },
  { windowMs: DAY_MS, limit: RATE_LIMITS.messageRequestPerDay },
];

const REPORT_EVIDENCE_BUDGETS: readonly WindowBudget[] = [
  { windowMs: HOUR_MS, limit: REPORT_EVIDENCE_PER_HOUR },
];

/**
 * Database-backed, per-actor **and** per-peer budgets for `E2eeService`'s abuse-sensitive
 * write paths (ADR 0020 §3/§5: "block/request/rate-limit rules still apply"; audit P1 — none
 * of these RPCs had any limit at all). Built on the same shared
 * `enforceWindowRateLimit`/`enforceWindowPeerRateLimit` helpers and `DbRateLimitStore` as
 * `DmRateLimitService`, so the limits survive a restart and are shared across every server
 * process from the start (§188's preamble). Action names are namespaced `e2ee_*`, which never
 * collides with the DM buckets even though the counters are independent.
 */
@Injectable()
export class E2eeRateLimitService {
  constructor(private readonly store: DbRateLimitStore) {}

  /** `SendEnvelopes` — the E2EE counterpart of a DM send. */
  async consumeEnvelopeSend(actorId: string, peer: string | undefined, now = new Date()) {
    await this.consume('e2ee_envelope', ENVELOPE_BUDGETS, actorId, peer, now);
  }

  /** `CreateE2eeConversation` — also accepts one logical message, plus establishes contact. */
  async consumeConversationCreate(actorId: string, peer: string | undefined, now = new Date()) {
    await this.consume('e2ee_conversation_create', ENVELOPE_BUDGETS, actorId, peer, now);
  }

  /** `AddE2eeMember`/`RemoveE2eeMember`-shaped group-control writes. */
  async consumeGroupControl(actorId: string, peer: string | undefined, now = new Date()) {
    await this.consume('e2ee_group_control', GROUP_CONTROL_BUDGETS, actorId, peer, now);
  }

  /** `AttachReportEvidence` — reporter-disclosed plaintext ingestion. */
  async consumeReportEvidence(actorId: string, peer: string | undefined, now = new Date()) {
    await this.consume('e2ee_report_evidence', REPORT_EVIDENCE_BUDGETS, actorId, peer, now);
  }

  private async consume(
    action: string,
    budgets: readonly WindowBudget[],
    actorId: string,
    peer: string | undefined,
    now: Date,
  ): Promise<void> {
    for (const budget of budgets) {
      await enforceWindowRateLimit(this.store, action, actorId, budget.limit, budget.windowMs, now);
      await enforceWindowPeerRateLimit(
        this.store,
        action,
        peer,
        budget.limit * PEER_MULTIPLIER,
        budget.windowMs,
        now,
      );
    }
  }
}

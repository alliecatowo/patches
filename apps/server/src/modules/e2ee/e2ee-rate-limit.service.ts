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

/** `EnrollDevice`/`RevokeDevice`/`PublishDeviceRoster`/`PublishIdentityRoot`/`UploadPrekeys` —
 * the identity/roster/prekey write paths audit P1/issue #269 found with no budget at all. Each
 * append is a signature verify plus insert served to every peer via `ListDeviceRosters`/
 * `GetDeviceRoster`, so it gets a low, rare-by-design budget like `GROUP_CONTROL_BUDGETS` rather
 * than a send-shaped one. */
const IDENTITY_WRITE_PER_HOUR = 20;
const IDENTITY_WRITE_BUDGETS: readonly WindowBudget[] = [
  { windowMs: HOUR_MS, limit: IDENTITY_WRITE_PER_HOUR },
];

/** `ListMailboxEnvelopes` poll budget, per actor, per minute (P19-019 part 3 — every other
 * `E2eeService` write path has a budget; this read had none). ADR 0032 commits every open TUI
 * thread to polling this exact RPC every 5 s while active — 12 requests/minute for one device —
 * so a budget sized like a write path (e.g. `dmSendPerMinute`'s 20) would throttle a single
 * legitimate device by itself. 60/minute is 5x that single-device baseline: enough headroom for
 * an actor with a couple of concurrent devices plus the occasional retry, while still bounding a
 * caller that ignores the cadence outright. No hourly companion budget — at 60/minute the minute
 * window already caps the hourly total at 3,600, so a separate hourly bucket could only ever be
 * redundant with it, never tighter. No peer-keyed companion either (unlike `ENVELOPE_BUDGETS`):
 * this poll reads the caller's own mailbox, not a peer's, so there is no peer identity to key
 * against. */
const MAILBOX_POLL_PER_MINUTE = 60;

/** One-time-prekey claims (audit P2-H4). A first message to a new contact claims once per target
 * actor; retries and a handful of new conversations an hour are normal, a loop over victims is
 * not. Per caller: 30 targets an hour. Per (caller, target): 3 an hour, which covers a lost
 * response plus a session reset. */
const OTK_CLAIMS_PER_CALLER_PER_HOUR = 30;
const OTK_CLAIMS_PER_PAIR_PER_HOUR = 3;

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

  /** `CreateE2eeConversation` — reserves a conversation and establishes first contact (ADR
   * 0035); carries no message, budgeted the same as before since authorization work is
   * unchanged. */
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

  /** `EnrollDevice`/`RevokeDevice`/`PublishDeviceRoster`/`PublishIdentityRoot`/`UploadPrekeys` —
   * see `IDENTITY_WRITE_BUDGETS`'s doc comment. */
  async consumeIdentityWrite(actorId: string, peer: string | undefined, now = new Date()) {
    await this.consume('e2ee_identity_write', IDENTITY_WRITE_BUDGETS, actorId, peer, now);
  }

  /** `ListMailboxEnvelopes` — see `MAILBOX_POLL_PER_MINUTE`'s doc comment for the cadence this
   * is sized against. Subject-keyed only, no peer. */
  async consumeMailboxPoll(actorId: string, now = new Date()) {
    await enforceWindowRateLimit(
      this.store,
      'e2ee_mailbox_poll',
      actorId,
      MAILBOX_POLL_PER_MINUTE,
      MINUTE_MS,
      now,
    );
  }

  /**
   * Whether this call may hand out a ONE-TIME prekey for `targetActorId` (audit P2-H4). Never
   * throws: over budget the claim still serves the signed-prekey-only bundle (ADR 0020 §5's
   * fallback), so a drain attempt costs the attacker nothing and the victim nothing, while a
   * legitimate sender is never refused outright. Two independent hourly budgets: per caller
   * across all targets, and per (caller, target) pair.
   */
  async allowOneTimePrekeyClaim(
    actorId: string,
    targetActorId: string,
    now = new Date(),
  ): Promise<boolean> {
    const perCaller = await this.store.increment(`e2ee_otk_claim:subject:${actorId}`, HOUR_MS, now);
    const perPair = await this.store.increment(
      `e2ee_otk_claim:pair:${actorId}:${targetActorId}`,
      HOUR_MS,
      now,
    );
    return perCaller <= OTK_CLAIMS_PER_CALLER_PER_HOUR && perPair <= OTK_CLAIMS_PER_PAIR_PER_HOUR;
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

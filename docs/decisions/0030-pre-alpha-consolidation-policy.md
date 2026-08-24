# 0030. Pre-alpha consolidation policy: no legacy grace periods before production

**Status:** Accepted (owner directive)
**Date:** 2026-08-22
**Supersedes (in part):** [0017](./0017-server-visible-dms.md) — the mode it decided for is being deleted
**Relates to:** [0006](./0006-activitypub-later.md), [0013](./0013-node-model-and-earlier-federation.md) (staged rollout intent), [0020](./0020-e2ee-direct-messages.md) §13 (unchanged), §153, Phase 13

## Policy

While Patches is in **pre-alpha development with zero users**, superseded systems are
**consolidated immediately**: the moment an implementation is replaced by its successor,
the old one is deleted in the same change set — wire vocabulary reserved and retired, code
paths removed, clients moved, docs swept. No dual stacks, no deprecation windows, no
compatibility shims, no "keep both until migration" tickets.

**Data preservation flips on by default only once the app is genuinely in production**
(when nodes host real external accounts). Until that line is crossed, persistence is
disposable: schema changes, mode removals, and fixture breaks require no backfill and no
migration path beyond what dev/test hygiene needs. After it is crossed, the normal rules
apply — additive wire changes, migration safety (§123), and honest deprecation windows for
anything users already depend on.

Rationale: every carried-forward legacy surface doubles the cost of each subsequent change,
forever, in exchange for compatibility with nobody. Tech debt compounds fastest in the
codebase that can least afford it — one with no users to justify the carry.

## Guardrails

- This policy **loosens nothing else**: hard prohibitions (§153, Amendment B), breaking-change
  discipline (never reuse a removed protobuf field or enum number — reserve them), layering,
  and review gates all still bind. Removal is still engineering, not deletion-by-`rm`.
- Architecturally significant consolidations get an ADR (this file records the policy; each
  application notes itself below). Trivial ones just happen.
- The production trigger is explicit: the policy sunsets automatically the day the flagship
  node accepts its first real external registration. At that point this file becomes a
  record of past practice, not permission.

## Application 1 — legacy server-visible DMs (this change set)

Amendment B (§183) made v0 DMs deliberately server-visible (ADR 0017) with mandated honesty
disclosures; Phase 13 built E2EE messaging alongside it under an immutable per-conversation
`security_mode`. Under this policy the superseded mode goes now:

1. `LEGACY_SERVER_VISIBLE` is removed from `CONVERSATION_SECURITY_MODE` (value reserved,
   never reused); `E2EE_V1` becomes the only conversation security mode.
2. The plaintext machinery goes with it: `messages.proto`'s send/read/request RPCs,
   `DirectMessageService`'s plaintext paths, the message-request flow, and every client's
   §183.1 disclosure copy.
3. What survives re-points at E2EE arrivals content-free: the MESSAGE notification type,
   unread counts, retention-config honesty, and moderation (`ReportE2eeMessage` + disclosed
   evidence remain THE story).
4. Federation of DMs remains prohibited exactly as before (ADR 0020 §13).

**Consequence:** production DMs go dark until the Phase 13 ship-gates pass (P13-016 →
P13-014). Accepted explicitly — zero users means zero cost, and removing the plaintext path
eliminates any temptation to soft-enable it later. Clients land in the same change set so no
build exists that speaks only the dead mode.

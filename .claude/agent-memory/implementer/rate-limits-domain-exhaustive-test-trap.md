---
name: rate-limits-domain-exhaustive-test-trap
description: packages/domain/src/limits.ts's RATE_LIMITS is asserted with an exhaustive toEqual in limits.test.ts — it's a literal restatement of INITIAL_VISION.md §188/§204's table, not a place for engineering-derived (non-spec) limits
metadata:
  type: feedback
---

`packages/domain/src/limits.ts`'s `RATE_LIMITS` object is checked in `limits.test.ts` with
`expect(RATE_LIMITS).toEqual({ ...exact literal table... })` — it exists specifically to restate
`INITIAL_VISION.md` §188/§204's size/rate-limit table so a drift fails loudly. Adding a new field
there for an operationally-derived limit (not sourced from the spec table, e.g. a poll-cadence
budget picked from an ADR) breaks that exhaustive check and also misrepresents the number as
spec-mandated when it isn't.

**Why:** discovered while adding P19-019 part 3's `ListMailboxEnvelopes` rate limit — ADR
0032 gives a poll cadence to size the limit against, but that's an engineering choice, not a
§188/§204 table entry.

**How to apply:** define ADR/engineering-derived rate limits as local constants inside the
consuming service file instead (see `e2ee-rate-limit.service.ts`'s `REPORT_EVIDENCE_PER_HOUR` for
existing precedent) — same file convention `E2eeRateLimitService`/`consumeMailboxPoll` follows —
not inside `RATE_LIMITS`. Only add to `RATE_LIMITS` when the number actually comes from the spec
table itself, and update `limits.test.ts`'s literal in the same change.

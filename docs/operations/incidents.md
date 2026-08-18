# Incident response

**Status: PLANNED / skeleton.** No production deployment exists yet as of 2026-08-17
(Phase 0), so this runbook has not been exercised. It exists now so that when production
does exist (Phase 7 onward), the team is not designing incident process for the first time
mid-incident. Update this document as real incidents happen and the process gets refined.

## Severity levels

| Severity | Definition                                                                                  | Example                                                                                         | Response expectation                                                         |
| -------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **SEV1** | Service is down or data is being lost/corrupted for all or most users.                      | Database unreachable, mass data loss, auth completely broken.                                   | Immediate response, all available hands, active mitigation until resolved.   |
| **SEV2** | A core feature is broken or badly degraded for many users, but the service is otherwise up. | Feed queries failing intermittently, media upload broken, login failures for a subset of users. | Prompt response during the day it's noticed; mitigate or roll back same-day. |
| **SEV3** | A non-core feature is broken, or a core feature is degraded for a small subset of users.    | Notifications delayed, one moderation tool misbehaving.                                         | Fix in the normal course of work, no emergency response required.            |
| **SEV4** | Cosmetic or minor issue, no functional impact.                                              | Copy error, minor rendering glitch in an edge-case terminal.                                    | Backlog as a normal bug.                                                     |

Given the project's current scale target (hundreds to low thousands of users,
`INITIAL_VISION.md` §125), this is a lightweight process appropriate to a small alpha
service — not a 24/7 enterprise on-call rotation.

## Detection

**Status: PLANNED.** Detection is expected to come from:

- structured logs and error monitoring (Sentry or a documented alternative — see
  `docs/operations/deployment.md` and `INITIAL_VISION.md` §100),
- Fly health checks failing,
- direct user reports (given the current scale, this may be the most common path early on).

## Response process

1. **Acknowledge.** Whoever notices the incident says so — in whatever the team's current
   communication channel is — and states the apparent severity.
2. **Assess.** Confirm scope: how many users affected, what's actually broken, is data at
   risk. Assign a rough severity from the table above.
3. **Mitigate.** Prefer the fastest safe path to stopping user impact:
   - roll back the most recent deploy if it's the likely cause (see rollback below),
   - disable a specific misbehaving feature if isolable,
   - for a SEV1 involving the database, consult `docs/operations/backups.md` for the
     restore procedure.
4. **Communicate.** For SEV1/SEV2, post a short status update to whatever public-facing
   channel exists at the time (this repo's README, a status page, or direct alpha-user
   communication — formalize this once there's a public alpha with real users, per
   `docs/product/roadmap.md`'s MVP polish phase, "public alpha has community rules").
5. **Resolve.** Confirm the mitigation actually worked — health checks green, smoke tests
   passing, user reports stopped.
6. **Postmortem.** For SEV1 and SEV2 incidents, write a postmortem (template below) within
   a few days while details are fresh.

## Rollback

Rolling back a bad deploy:

1. Redeploy the last known-good image/commit through the normal deploy path (see
   `docs/operations/deployment.md`) — do not hand-patch a running Fly Machine.
2. If the bad deploy included a migration, consult the expand/contract and rollback
   guidance in `docs/operations/database.md` before assuming a blind schema rollback is
   safe — it frequently is not once real data has moved through the new shape.
3. Confirm health checks and smoke tests pass post-rollback before declaring the incident
   mitigated.

## Postmortem template

```markdown
# Postmortem: <short title>

**Date:** YYYY-MM-DD
**Severity:** SEV1 | SEV2 | SEV3
**Duration:** start time — end time (impact window, not detection-to-fix)
**Authors:**

## Summary

One or two sentences: what broke, who was affected, for how long.

## Timeline

- HH:MM — event
- HH:MM — event
- HH:MM — resolved

## Root cause

What actually caused this — be specific, not "a bug."

## Impact

Who/what was affected, and how badly (data loss? downtime? degraded experience?).

## What went well

## What went poorly

## Action items

- [ ] Owner — action — due date
```

## Related documents

- `docs/operations/deployment.md` — deploy process and rollback mechanics.
- `docs/operations/database.md` — migration rollback policy.
- `docs/operations/backups.md` — restore procedure for data-loss incidents.

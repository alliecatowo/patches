---
name: suspended-account-auth-guard-carveout
description: A blanket AuthGuard that rejects SUSPENDED accounts makes any RPC a suspended user must still call (moderation notices, appeals) unreachable — needs a narrow guard variant, not a change to AuthGuard.
metadata:
  type: feedback
---

When a global `AuthGuard` rejects every authenticated RPC for a `SUSPENDED` account (this
repo's does, spec §65/P6-004), any RPC that a suspended account must still be able to reach —
reading its own moderation notice, filing an appeal against the very suspension — becomes
unreachable through the normal guard. This isn't a hypothetical: writing the appeals
integration test (P14-011) hit it immediately (`PERMISSION_DENIED: This account has been
suspended` on `ListMyModerationNotices`/`CreateAppeal` right after simulating a suspend).

**Why:** The fix is not to weaken `AuthGuard` globally (every other RPC in the app correctly
keeps rejecting a suspended caller) — it's a narrow, additive sibling guard
(`SuspensionTolerantAuthGuard` in this repo) used via `@UseGuards(...)` on only the specific
RPCs that must survive suspension, registered as a provider in the owning module(s). A
**deleted** account is a related but distinct case: if deletion is a hard/immediate delete,
the session is genuinely gone and there's nothing left to fix. But if deletion is
soft-with-a-grace-period (`deleted_at` set immediately, actual purge deferred to a worker job
via something like `account_deletion_requests.purge_after`), the account is exactly as
appealable as a suspension is during that window — resolved 2026-08-19 by extending
`SuspensionTolerantAuthGuard` to also allow a caller whose deletion-request row is still
pending (not cancelled, not purged, `purge_after` not yet passed), rejecting again once the
grace period lapses. Check for a grace-period table before assuming "deleted = permanently
unreachable."

**How to apply:** Any time a spec section describes a self-service flow that responds to an
enforcement action (appeals, dispute mechanisms, "explain yourself" UX), check whether the
account being acted on can still authenticate at all under the existing guard before assuming
the RPC is reachable. If the enforcement action is a soft-delete/session-invalidating one, the
self-service flow is fundamentally blocked and needs a different mechanism (email, a grace
period before the hard delete, etc.) — not just a guard tweak.

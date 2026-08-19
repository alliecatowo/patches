# Social graph: follows and locked-account follow requests

Status: implemented. Spec: `INITIAL_VISION.md` §50, §61–63, Amendment C §197.5.

## Follows

A `follows` row (`packages/database/src/entities/follow.entity.ts`) is the only representation
of "A follows B" — there is no `NONE` status; the absence of a row **is** `NONE`. A v0 local
account transitions straight to `FOLLOWING` (spec §50). Following a **remote** actor
(P8-002/P8-003) instead creates a row with `status = 'PENDING'` until that actor's own node
sends back an `Accept` activity, at which point `InboxService` flips it to `FOLLOWING`.

## Locked accounts and follow requests (§197.5)

`actor_privacy_prefs.locked` (default `false`, owned by `PrivacyService`,
`packages/database/src/entities/actor-privacy-prefs.entity.ts`) is a correctness fix, not a
cosmetic control: `POST_VISIBILITY_FOLLOWERS` is enforced by a `follows` row lookup, and before
this feature shipped `FollowActor` created that row with no approval step at all — so a
followers-only post was one RPC call away from readable by any account on the node.

When `FollowActor`'s target is a **locked local actor**, the call creates a pending row in its
own `follow_requests` table (`packages/database/src/entities/follow-request.entity.ts`)
instead of a `follows` row, and `FollowActorResponse.requested` comes back `true`. This is
deliberately a separate table from `follows.status = 'PENDING'`, not a third value reusing that
column: the remote-federation `PENDING` state above means "waiting on another server's
`Accept`", while a locked-account request means "waiting on a human's approval" — two unrelated
processes that would otherwise race the same row for two different reasons. `Relationship.state`
still reports `FOLLOW_STATE_PENDING` for both cases (a client showing "follow state" doesn't
need to care which), but `Relationship.requested`/`requested_by` disambiguate the locked-account
case specifically:

- `requested` — the caller has a pending outgoing request toward the target.
- `requested_by` — the target has a pending incoming request toward the caller (only meaningful
  when the caller's own account is locked).

### Lifecycle

- **Create** — `FollowActor` against a locked local actor: block-aware (rejects with
  `ACTOR_BLOCKED` exactly like an ordinary follow), rate-limited per actor and per peer
  (`GraphService`'s `FollowRequestRateLimitService`, database-backed via the shared
  `DbRateLimitStore`/`enforceWindowRateLimit` helpers — 20/hour and 100/day per actor, 5x that
  per peer), and idempotent (calling again while a request is already pending returns the same
  outstanding result, not a second row or a second notification). Writes a `FOLLOW_REQUEST`
  notification to the target.
- **List** — `ListFollowRequests`: the caller's own inbound queue only, keyset-paginated on
  `(created_at DESC, id DESC)` (spec §46). There is no `actor_id` parameter — a caller can only
  ever see their own request queue.
- **Accept** — `AcceptFollowRequest(actor_id)`: creates the `FOLLOWING` `follows` row and
  deletes the request row in the same transaction. `FOLLOW_REQUEST_NOT_FOUND` if none is
  pending. Writes a `FOLLOW` notification **to the requester** (not the accepting actor) — "your
  request was accepted", reusing the existing `FOLLOW` notification type rather than adding a
  new one purely for this. Clients rendering `FOLLOW` notifications should be aware a recipient
  can receive one either because someone followed them directly, or because their own request
  was just accepted; the `Notification.actor` is the locked account in the latter case.
- **Reject** — `RejectFollowRequest(actor_id)`: deletes the request row, never creates a
  `follows` row. `FOLLOW_REQUEST_NOT_FOUND` if none is pending. Deliberately does **not** notify
  the requester — same non-disclosure reasoning §62 already applies to blocks (telling someone
  they were specifically declined has no legitimate use a silent absence doesn't already serve,
  and is a plausible harassment vector).
- **Cancel** — there is no separate "cancel my request" RPC: `UnfollowActor` also deletes any
  pending outgoing request toward the target, in addition to its existing `follows`-row delete.
  A client's "unfollow" and "cancel request" UI affordances can call the same RPC.
- **Unlocking never auto-accepts** — flipping `actor_privacy_prefs.locked` back to `false` does
  not touch any row in `follow_requests`. A request stays pending until explicitly accepted or
  rejected, or cancelled by the requester, regardless of the target's current `locked` value.
  Existing followers acquired while the account was locked are unaffected either way — nothing
  in this feature ever removes a `follows` row on a lock/unlock transition.

### What a client must add

- Show `requested`/`requested_by` somewhere in a profile/relationship view — "follow requested"
  vs. "follow" vs. "following" vs. (for the target) "wants to follow you".
- A request-queue screen backed by `ListFollowRequests`/`AcceptFollowRequest`/
  `RejectFollowRequest`.
- Handle `FOLLOW_REQUEST`-type notifications (new to the client), and be aware that a
  `FOLLOW`-type notification may now mean "your request was accepted" rather than "you gained a
  follower" — the `Notification.actor` field is the only signal available to tell them apart
  (it is the locked account either way, but in the "accepted" case the true directionality is
  the recipient following that actor, not the other way around).
- `FOLLOWERS`-visibility posts may now be described honestly as private to accepted followers,
  not merely "not shown publicly" (see `docs/product/privacy.md`).

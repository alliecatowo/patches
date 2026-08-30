# 0039. Realtime is a server-streaming invalidation channel, with unary poll as the mandatory fallback

**Status:** Accepted (design only — does not authorize implementation)
**Date:** 2026-08-29
**Decides:** O-004 / issue #151 ("Reopen ADR 0032 to design realtime streaming, not polling")
**Supersedes:** [0032](./0032-dm-delivery-stays-poll-based.md) — the _deferral_ of streaming, not
its evidence, its fallback SLA, or its exclusions
**Relates to:** [0004](./0004-postgres-outbox.md), [0016](./0016-connect-transport-and-client-sdk.md),
[0020](./0020-e2ee-direct-messages.md), [0029](./0029-scale-path-banned-tech-language.md),
[0030](./0030-pre-alpha-consolidation-policy.md), [0038](./0038-api-versioning-policy.md);
`docs/research/connect-streaming.md`; `docs/architecture/realtime.md`;
`docs/architecture/rollouts.md`; `INITIAL_VISION.md` §4.2, §12, §46, §56, §57, §94, §128,
§153, §183.3, §184.3, §194, §195
**Needs a follow-up implementation ADR or ticket set before any `.proto` or code change.**

## Context

ADR 0032 (2026-08-25) deferred streaming and published a polling SLA. That was the right
engineering default from the evidence it collected. It also routed two questions to the owner
and refused to spend them itself:

1. whether the reference node wants sub-minute DM delivery as a product promise;
2. whether to spend the lapsed §56 / §183.3 push budget.

The owner answered the first on the same day: Patches should be realtime (signals / channels /
sockets). Issue #151 / O-004 is that answer written down. This ADR is the design that answer
requires.

Nothing in the owner's answer relaxes a hard rule. §12 / §153 still ban Redis and Kafka.
Amendment B still bans ranking, trending, and activity-derived recommendations. §183.3 / §194
still ban presence, typing indicators, and read receipts (B-093 stays the gate for anything
adjacent). §183.4 / §194 still ban DM bodies in logs, metrics, traces, and errors. §56's
"TUI can poll when active and refresh manually" stays true: polling is not removed. §94
(Firebase) is also unchanged — this is not FCM/APNs and not a hosted realtime SaaS.

What 0032 got right, and this ADR keeps:

- Transport is no longer the objection. Connect server-streaming is viable on every planned
  hop over HTTP/1.1 (`docs/research/connect-streaming.md`, verified 2026-08-25). ADR 0016's
  "browsers / RN cannot stream" premises are still stale.
- The worst freshness defects 0032 named were client state-management bugs, not poll
  intervals. A stream feeding a list that never re-renders is still a stale list.
- In-thread TUI mail already polls at 5 s. The product gap is out-of-thread arrival, the
  conversation list, the notifications list, and web thread replies
  (`docs/architecture/realtime.md`).
- A held connection is a presence signal _to the node_. That must not become presence,
  typing, or read receipts _to other users_, and it must not become a ranking input.
- Cross-machine fan-out with no bus is the load-bearing infrastructure problem. The server
  autoscales to three machines; a `SendEnvelopes` on machine 2 must wake a subscriber on
  machine 1. §12 / §153 forbid Redis pub/sub, Kafka, RabbitMQ. 0032 correctly rejected
  Postgres `LISTEN` / `NOTIFY` on intent (it is pub/sub by another name, un-ACKed, and it
  spends a dedicated connection against `DATABASE_POOL_MAX = 10`).
- The existing per-request `read` budget cannot constrain a long-lived stream. A concurrent-
  stream limiter has to exist before any stream is offered.
- `grpc.max_connection_age_ms` is 30 minutes on purpose. Every stream is a session plus
  reconnect, not a forever socket.
- Fly's proxy idle-timeout default is still unverified. Connect has no in-protocol heartbeat.

What 0032 weighed and this ADR re-weighs because the owner flipped the product default:

- Taking out-of-thread latency from 60 s toward sub-second _is_ the "addictive notification
  frequency" dial §4.2 names. The owner has now set that dial. The remaining job is to turn
  it without smuggling in the rest of the engagement machinery 0032 was protecting against.

## Decision

**Realtime in Patches is one authenticated server-streaming invalidation RPC. Unary list /
count RPCs stay the source of truth and the mandatory fallback. This ADR authorizes that
design only. It does not authorize a `.proto` edit, a Connect-edge change, a migration, or
a client subscribe path.**

A later implementation change-set — its own tickets, behind the reversible gate in §7 —
is what actually ships it.

### 1. One wake-up stream, never a payload stream

The RPC is a new `RealtimeService` (spec §47: do not pile this onto `NotificationService` or
`E2eeService`, and do not create a giant `PatchesService`). It is the only streaming RPC this
design permits. Client-streaming and bidi stay forbidden: browsers cannot client-stream,
`@connectrpc/connect-express` cannot serve bidi, and ADR 0016's generic edge has no shape
for either.

```proto
service RealtimeService {
  // Server-streaming. Authenticated. The only streaming RPC this design permits.
  rpc SubscribeSignals(SubscribeSignalsRequest) returns (stream RealtimeSignal);
}

message SubscribeSignalsRequest {
  // Opaque watermark from the last *non-heartbeat* signal, or empty to start "now".
  // Clients must never construct or parse one (same rule as PageInfo, spec §46).
  string resume_token = 1;

  // Calling actor's device, required to receive MAILBOX_CHANGED for that mailbox.
  // Empty: the stream still carries unread / conversation-list / notification signals.
  string device_id = 2;
}

enum RealtimeSignalKind {
  REALTIME_SIGNAL_KIND_UNSPECIFIED = 0;
  REALTIME_SIGNAL_KIND_HEARTBEAT = 1;
  REALTIME_SIGNAL_KIND_RESYNC = 2;
  REALTIME_SIGNAL_KIND_MAILBOX_CHANGED = 3;
  REALTIME_SIGNAL_KIND_UNREAD_COUNT_CHANGED = 4;
  REALTIME_SIGNAL_KIND_CONVERSATION_LIST_CHANGED = 5;
  REALTIME_SIGNAL_KIND_NOTIFICATION_LIST_CHANGED = 6;
  // Designed, not in the first implementation wave — see §8.
  REALTIME_SIGNAL_KIND_THREAD_CHANGED = 7;
  REALTIME_SIGNAL_KIND_TIMELINE_HINT = 8;
}

message RealtimeSignal {
  RealtimeSignalKind kind = 1;
  // Present on every non-heartbeat signal. Heartbeats MUST NOT advance it.
  string resume_token = 2;
  google.protobuf.Timestamp occurred_at = 3;

  // MAILBOX_CHANGED only. Never a body, never ciphertext, never encrypted_header.
  string conversation_id = 4;
  string device_id = 5;

  // THREAD_CHANGED only.
  string post_id = 6;

  // TIMELINE_HINT only: a stable id for the hinted surface ("home", "local", …).
  string resource_id = 7;

  // UNREAD_COUNT_CHANGED may echo GetUnreadCount so the badge can move without a
  // follow-up RPC. Already public to the caller. Never a per-conversation unread
  // breakdown — that would be a read-receipt-shaped leak (§183.3).
  uint32 unread_count = 8;
}
```

Field layout uses a discriminator enum plus empty-when-unset scalars, the same pattern as
`Notification`. **No `oneof`, no `map`.** ADR 0016's Connect edge still rejects both; this
design does not spend that fight on a tagged union we do not need.

The stream carries _invalidations_, not rows:

| Signal                      | Client then calls                                          |
| --------------------------- | ---------------------------------------------------------- |
| `MAILBOX_CHANGED`           | `E2eeService.ListMailboxEnvelopes` (existing unary)        |
| `UNREAD_COUNT_CHANGED`      | nothing required if `unread_count` is set; else the unary  |
| `CONVERSATION_LIST_CHANGED` | `DirectMessageService.ListConversations`                   |
| `NOTIFICATION_LIST_CHANGED` | `NotificationService.ListNotifications`                    |
| `THREAD_CHANGED`            | the existing thread-read RPC                               |
| `TIMELINE_HINT`             | the existing "new posts" check — **never auto-inserts**    |
| `RESYNC`                    | one unary catch-up of every surface the client cares about |
| `HEARTBEAT`                 | nothing                                                    |

Why invalidation, not envelopes:

- The node cannot read E2EE bodies. Pushing `encrypted_header` / `ciphertext` faster does
  not make "realtime" more real, and it would put mailbox bytes on a second path that
  backpressure is then allowed to drop.
- Web and mobile still cannot decrypt. A payload stream would accelerate ciphertext toward
  clients that cannot use it (0032 fact 3).
- Dropping a wake is always safe: the mailbox / notification / conversation row is already
  durable. Dropping an envelope from a payload stream is only safe if the client also polls,
  at which point the payload was decoration.
- The fallback (§2) is then the same RPCs, not a second read model.

`patches.v1` is additive-only (ADR 0038). Adding this service is a legal `v1` change. Removing
it later is not — the RPC stays in the schema even when the gate is off, and returns
`UNIMPLEMENTED`.

### 2. Mandatory non-streaming fallback

Every client that offers realtime MUST remain correct with the stream absent, rejected, or
killed mid-flight. This is not a nicety for old builds. It is how the TUI works over SSH,
jump hosts, HTTP CONNECT proxies that break HTTP/2, corporate MITM that does not forward
chunked responses, and any Fly / Cloudflare hop that idles out a long stream.

Concretely:

- `ListMailboxEnvelopes`, `GetUnreadCount`, `ListConversations`, `ListNotifications`, and
  the timeline / thread unaries stay. They keep ADR 0032's published intervals as the
  **fallback SLA** — the promise that still holds when the stream is not there.
- On `UNIMPLEMENTED`, `UNAVAILABLE`, `DEADLINE_EXCEEDED`, `RESOURCE_EXHAUSTED`, or a dropped
  stream the client cannot resume, the client falls back to those intervals without a user-
  visible "live" / "reconnecting" chrome that would imply a messenger.
- Manual refresh (§56) stays required on every surface the stream would have freshened.
- A failed subscribe MUST NOT render as "no messages" / "no notifications". Last-known state
  stays; the next poll retries. That house rule from 0032 §1 survives.
- No client string may imply push, live, instant, or background delivery while the process
  is closed. Patches still does not push. A stream is an open-client path only.
- The TUI stays on native gRPC (`:50051`, ADR 0016). gRPC server-streaming is what it uses
  when the gate is on. Web / mobile use Connect server-streaming. Same proto, two
  transports, one fallback.

Detection is the RPC failing, not a preflight capability guess. A client that thinks it can
stream and then cannot must degrade, not hang.

### 3. Auth and authorization

- `SubscribeSignals` is authenticated the same way as every other non-public RPC:
  `authorization: Bearer <access token>`. Cookies stay unused (ADR 0016 §5).
- The Connect edge forwards the same allow-listed metadata it forwards today
  (`authorization`, `user-agent`, `accept-language`, `x-request-id`). The in-process gRPC
  hop still runs `AuthGuard`, the existing interceptors, and `RpcExceptionsFilter`. There
  is no second authn path for streams.
- Authorization is the calling actor only. The server emits a signal iff that actor would
  be allowed to observe the underlying unary. `MAILBOX_CHANGED` requires `device_id` to
  belong to the caller. `THREAD_CHANGED` requires the same visibility as the thread-read
  RPC. A block must not become observable as "a signal you almost got" (§62, no block
  oracle).
- Access-token expiry ends the stream with `UNAUTHENTICATED`. The client refreshes via the
  existing unary `RefreshSession` and resubscribes. The stream itself never carries a
  refresh token and never rotates one.
- `resume_token` is an authorization boundary: a token minted for actor A MUST NOT resume
  actor B's watermark. Treat a foreign or malformed token as empty (start now) plus a
  `RESYNC`, not as an error that confirms the token's owner.

### 4. Backpressure, heartbeat, reconnect

Connect has no in-protocol ping (`docs/research/connect-streaming.md` §7). Fly's idle-
timeout default is unverified. `GRPC_MAX_CONNECTION_AGE_MS` is 30 minutes.
`HTTP_REQUEST_TIMEOUT_MS` is **30 seconds today** (`docs/operations/capacity.md`) and
will kill a Connect stream at the HTTP listener unless the implementation exempts
streaming responses. That exemption is a required implementation item, not a footnote.

Rules:

- The server heartbeats every **15 s** of silence (`REALTIME_SIGNAL_KIND_HEARTBEAT`).
  Heartbeats carry no actor data and **do not** advance `resume_token`. Advancing on
  heartbeat would skip a real event that landed during an idle gap.
- Per-stream outbound queue: **16** signals. Invalidations of the same `(kind, resource)`
  coalesce (keep the newest). Overflow sends one `RESYNC` and drops the rest. Never block
  a write-path transaction on a slow subscriber.
- The stream handler MUST NOT hold a pooled Postgres connection for the life of the
  stream. `DATABASE_POOL_MAX` is 10. A held connection per subscriber is how the node
  dies.
- Client reconnect: exponential backoff with jitter, cap at the fallback poll interval
  so a flapping stream cannot be more expensive than polling. After every reconnect,
  emit one unary catch-up even if `resume_token` looks current — the wake log is
  ephemeral (§5).
- A `RESYNC` means "your watermark is older than retention; poll." It is not an error.
- `grpc.max_connection_age_ms` firing is an expected reconnect, not an incident.

### 5. Cross-machine fan-out without a bus

Writers (a `SendEnvelopes` commit, a notification insert, a conversation-list mutation)
insert one row into a `realtime_signals` wake log **in the same transaction as the
mutation** — the transactional-outbox pattern ADR 0004 already requires. Each server
process that currently holds at least one stream polls, on a short-lived checkout:

```sql
SELECT id, actor_id, kind, resource_id, occurred_at
  FROM realtime_signals
 WHERE actor_id = ANY($held_actor_ids)
   AND (occurred_at, id) > ($watermark_at, $watermark_id)
 ORDER BY occurred_at ASC, id ASC
 LIMIT $batch;
```

One query per process per tick, not one query per stream. Interval: **250 ms**. Retention:
delete rows older than **120 s**. A subscriber who was gone longer than that gets `RESYNC`
and unaries.

This is not Redis. It is not Kafka. It is not `LISTEN` / `NOTIFY`. It is the outbox family
the spec already chose, reused as an ephemeral wake log. Lossy-by-design is acceptable
because the durable copy lives in the mailbox / notifications / conversations tables the
unaries already read.

The 250 ms poll is the floor on "how realtime." Combined with one RTT that is the
freshness this design actually promises while a client is subscribed — not "instant,"
not "sub-frame." Copy must not claim more.

### 6. Per-node bounds

Defaults, published as env (same style as `docs/operations/capacity.md`) and enforced
before the handler yields a stream:

| Bound                                     | Default | On exceed                   |
| ----------------------------------------- | ------- | --------------------------- |
| Concurrent `SubscribeSignals` per actor   | 4       | `RESOURCE_EXHAUSTED` → poll |
| Concurrent `SubscribeSignals` per process | 64      | `RESOURCE_EXHAUSTED` → poll |
| Per-stream outbound queue                 | 16      | coalesce; then one `RESYNC` |
| Heartbeat interval                        | 15 s    | —                           |
| Wake-log poll interval                    | 250 ms  | —                           |
| Wake-log retention                        | 120 s   | stale resume → `RESYNC`     |
| Max stream lifetime                       | 15 min  | end; client resubscribes    |

Four per actor covers TUI + web + mobile + one spare. 64 per process is a starting cap
for a 512 MB `shared-cpu-1x`, not a measured optimum — revisit under ADR 0029's
measurement gate, do not raise it on a hunch.

A `Stream*` RPC spends **one** existing `read` token at subscribe time. That is not a
budget. The table above is the budget. Implementation must add this limiter; the current
`rpc-budget.ts` cannot express it.

Metrics may count open streams, subscribe accept/reject, heartbeats, resyncs, and
reconnects. They MUST NOT label those series with `actor_id` or `device_id` (that is a
presence time series). They MUST NOT include conversation ids on a high-cardinality
path. They MUST NOT include any mailbox payload, ciphertext, or DM body — there is none
on this stream, and the surrounding unary paths stay under the existing §183.4 / §194
redaction rules.

### 7. Reversible rollout

Issue #151 cites §94 for reversibility. §94 is the Firebase prohibition (honored: this
is not Firebase). The actual reversible-gate rule is `docs/architecture/rollouts.md`
(issue #202). This design uses that rule.

Two stacked gates, both off by default:

1. **Node-policy env** `REALTIME_SIGNALS=false`. When false the RPC exists and returns
   `UNIMPLEMENTED`. No stream is held. No wake-log poll runs.
2. **Client feature flag** `realtime_signals`, `kind: 'rollout'`, `defaultEnabled: false`,
   served on `GetNodeInfoResponse.feature_flags`. Clients that do not understand the flag
   never subscribe.

This is a rollout of an already-complete delivery path (unary poll), not a function gate.
§184.3 still holds: turning the flag off must not take away the ability to receive DMs
or notifications. It only takes away the faster path.

Rollback: set `REALTIME_SIGNALS=false` (and/or `FEATURE_FLAGS=realtime_signals=false`)
and restart. In-flight streams end. Every client already has the poll fallback. No
schema rollback, no data migration, no client release. The wake-log table can sit empty.

The first implementation change-set is what adds the flag to
`FEATURE_FLAG_DEFINITIONS` and a row to `docs/architecture/rollouts.md`'s log. This ADR
does not add either.

### 8. What the first implementation wave may emit

Designed now, so the enum does not get a v2 later:

- Wave 1 (the O-004 / #151 surface): `HEARTBEAT`, `RESYNC`, `MAILBOX_CHANGED`,
  `UNREAD_COUNT_CHANGED`, `CONVERSATION_LIST_CHANGED`, `NOTIFICATION_LIST_CHANGED`.
- Wave 2, each needing its own product note because `docs/architecture/realtime.md`
  said so: `THREAD_CHANGED`, `TIMELINE_HINT`. `TIMELINE_HINT` is the existing web
  "new posts" pill. It MUST NOT auto-insert into a feed the user is mid-read on
  (§4.2). It MUST NOT carry a rank, a score, or an order.

No other kind is authorized by this ADR. In particular: no `TYPING`, no `PRESENCE`,
no `READ_RECEIPT`, no `DELIVERED`, no `ONLINE`, no `LAST_SEEN`. B-093 is still the
gate, and B-093 is still "encrypted control envelopes over the existing fanout so
the node never sees the metadata in plaintext" — the opposite of putting those
facts on a server-visible stream.

### 9. Presence, copy, and what the node learns

A held stream tells the node a client process is connected, at roughly 15 s
resolution plus the 250 ms wake poll. That is sharper than today's 30–60 s poll
pattern. It is still not "this human is looking at the screen," and it MUST NOT
be published to any other actor.

Required at implementation time, not by this ADR rewriting copy today:

- Do not extend `requiredConversationDisclosure` with "whether you are online."
  That phrase is a presence feature, which this ADR refuses to ship. The existing
  sentence already covers routing metadata: the node can see who you message and
  when. Stream liveness is operator-visible the same way mailbox-fetch patterns
  already are (`docs/architecture/e2ee.md`).
- Operator-facing `GetNodePolicy` / e2ee architecture docs should say, when the
  gate is on, that a subscribed client holds a connection the node can observe.
  User-facing surfaces must not say "online," "last seen," "live," "instant," or
  "push."
- Heartbeats are not logged per actor at info. A debug logger that prints every
  heartbeat with an actor id is a presence log and is forbidden.

### 10. Connect edge and ADR 0016

Implementation will have to:

- Relax `packages/proto/src/es.test.ts` from "every RPC is unary" to "the only
  non-unary RPC is `RealtimeService.SubscribeSignals`, and it is
  `server_streaming`." Client-streaming and bidi still fail the test.
- Teach `apps/server/src/transport/connect/grpc-proxy.ts` to forward that one
  method with `makeServerStreamRequest`, chunk by chunk, still with identity
  serializers. Every other method stays `makeUnaryRequest`. The contained cast
  ADR 0016 §3 allowed stays contained.
- Exempt this RPC from `HTTP_REQUEST_TIMEOUT_MS`.
- Smoke-test a multi-minute heartbeat stream against a real Fly Machine before
  the reference node flips `REALTIME_SIGNALS=true`. The research note left Fly's
  idle timeout unverified on purpose; that verification is an implementation
  gate, not a reason to keep deferring the design.

None of those edits are authorized by this file landing.

### 11. Relationship to §56, §183.3, and platform push

§183.3 still says delivery is poll-based like notifications, and §56 still says
do not implement push infrastructure until mobile exists. Mobile exists. This
ADR does **not** spend that budget on APNs / FCM — that remains 0032's T3, its
own ADR, owner sign-off, because a push payload is a new egress point for DM
metadata (§183.4, §194).

What this ADR does: keep the poll path as the compatibility and fallback
contract, and add an optional in-process server stream for clients that can
hold one. That is the smallest substitute that honors the owner's realtime
product call without deleting the spec's poll requirement or inventing push.

The spec text in `INITIAL_VISION.md` is not edited by this ADR. The deviation
is recorded here per §155.

## Consequences

**Positive**

- The owner's realtime product call has a design that does not require Redis,
  Kafka, `LISTEN` / `NOTIFY`, Firebase, or a second payload read-model.
- Every client keeps working over SSH and hostile proxies because the unaries
  never go away.
- Amendment B's ranking / presence / typing / read-receipt bans have an explicit
  non-inheritance clause instead of a stream that quietly grows them.
- DM bodies never touch this RPC, so they cannot appear in its logs or metrics.
- Rollback is an env flip. The schema addition is additive and can sit dark.

**Negative — stated plainly**

- The node gains a continuous-enough connection register. Mitigated by bounds,
  by not publishing it, by not logging it per actor, and by refusing to build
  presence UX on top — not by pretending the register does not exist.
- Cross-machine wake is a 250 ms Postgres poll per process. That is better than
  per-client 5 s mailbox drains, and worse than a bus we are not allowed to add.
  At three `shared-cpu-1x` machines this is cheap; it is also the first thing
  to re-measure if T2-class load returns.
- ADR 0016's unary-only edge becomes a one-RPC exception. Recoverable, but it
  is the per-RPC divergence 0016 exists to prevent, spent once, on purpose.
- `HTTP_REQUEST_TIMEOUT_MS` and Fly idle timeout will break the first naive
  implementation. They are called out so they are not discovered in production.
- This file ships no freshness improvement. Until an implementation change-set
  lands, ADR 0032's poll SLA is still what users get.
- Spec §183.3's "poll-based" sentence is now a compatibility requirement plus
  this ADR, not the whole delivery story. A future spec amendment should say
  so; this ADR will not edit `INITIAL_VISION.md`.

## Alternatives considered

- **Keep 0032's deferral.** Rejected by the owner on 2026-08-25. The evidence
  in 0032 remains useful; the product default does not.
- **Server-streaming `StreamMailboxEnvelopes` (0032 alternative a).** Rejected
  as the primary RPC: it serves ciphertext to clients that cannot decrypt,
  duplicates the mailbox read path, and makes fallback a different shape.
  Invalidation plus the existing unary is smaller.
- **One streaming RPC per surface** (`StreamMailbox`, `StreamNotifications`,
  …). Rejected: four connections, four limiter slots, four reconnect state
  machines, for signals that already share a wake log.
- **Postgres `LISTEN` / `NOTIFY`.** Rejected again, for the same intent reason
  0032 recorded. If it is ever right it needs its own ADR arguing merit, not
  a naming dodge around §12.
- **Long-poll hanging `ListMailboxEnvelopes`.** Smallest transport change, and
  0032's "revisit first" option. Rejected as the _design_ now that the owner
  asked for signals / channels / sockets: it still holds a request and a pool
  slot per waiter, it does not generalize to notifications / threads, and
  `HTTP_REQUEST_TIMEOUT_MS` / connection-age make its deadline lie. Not
  forbidden as a private implementation trick inside `SubscribeSignals` if
  Fly will not hold a stream — but the public RPC is the stream.
- **Tighten poll intervals only.** Rejected as the answer to #151. It remains
  the fallback, and it remains the cheap dial if the stream cannot be held.
- **Platform push (APNs / FCM) now.** Rejected as this ADR's scope. Still T3.
- **WebSockets / SSE beside the protobuf schema.** Rejected: §153 / ADR 0002
  keep the contract on protobuf. Connect server-streaming _is_ the socket.
- **Authorize implementation in this file.** Rejected. The Connect-edge
  exception, the timeout exemption, the new limiter, the Fly smoke test, and
  the copy review are a program, not a drive-by. Design lands first so those
  tickets share one shape.

## What still has to change (not done here)

Implementation tickets, when opened, own at least:

- `packages/proto/proto/patches/v1/realtime.proto` (new) + `pnpm proto:gen` +
  relaxing the unary-only guards as specified in §10.
- `realtime_signals` wake-log table, writer hooks on the existing mutation
  transactions, per-process poller that does not pin a pool slot.
- Concurrent-stream limiter and the env vars in §6.
- `HTTP_REQUEST_TIMEOUT_MS` exemption for server-streaming.
- `REALTIME_SIGNALS` env + `realtime_signals` feature flag + rollouts.md row.
- Connect `makeServerStreamRequest` forwarding for this RPC only.
- TUI (gRPC) and web (Connect) subscribers with the §2 fallback; mobile only
  if a DM / notification surface exists to consume it.
- Fly multi-minute heartbeat smoke test.
- Operator-facing policy / e2ee doc note in §9. No user-facing "online."
- Tests: authz (no foreign mailbox, no block oracle), heartbeat does not
  advance resume, overflow emits `RESYNC`, gate-off is `UNIMPLEMENTED`,
  no payload field exists on `RealtimeSignal`, fallback poll still meets
  0032's SLA when the stream is killed.

## Routed to the owner

Nothing in this design requires a further product call. Two things still do,
and this ADR does not spend them:

1. **APNs / FCM** (0032 T3) — a new metadata egress, own ADR.
2. **B-093** (presence / typing / read receipts as encrypted control
   envelopes) — still not this stream, still not v0 user-visible.


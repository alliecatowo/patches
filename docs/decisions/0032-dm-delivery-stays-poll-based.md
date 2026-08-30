# 0032. DM delivery stays poll-based, with a stated freshness SLA and a measured re-open gate

**Status:** Superseded by [0039](./0039-realtime-invalidation-stream.md)
**Date:** 2026-08-25
**Decides:** P19-011 ("DM realtime decision")
**Relates to:** [0016](./0016-connect-transport-and-client-sdk.md) (unary-only Connect edge; two of
its factual premises corrected below), [0020](./0020-e2ee-direct-messages.md),
[0029](./0029-scale-path-banned-tech-language.md) (measurement-gated escalation),
[0030](./0030-pre-alpha-consolidation-policy.md); `INITIAL_VISION.md` §4.2, §12, §56, §183.3,
§194, §195

## Context

P19-011 asked for one of two answers: design streaming DM delivery (RPC shapes, fallback,
backpressure, auth, bounds, rollback) or consciously defer and commit to the polling SLA. It is
posed as a product decision, and it is one.

The task's premise — "today is unary-poll (60 s unread)" — turned out to be wrong in **both**
directions, which is most of why this ADR reaches the conclusion it does.

### What actually ships today

Everything below was read in-tree.

| Surface                                         | Mechanism                                      | Interval                  | Source                                                                                                                 |
| ----------------------------------------------- | ---------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| TUI, E2EE thread **open**                       | `ListMailboxEnvelopes` drain + ack             | **5 s**                   | `apps/tui/src/screens/MessagesScreen.tsx:424,590`                                                                      |
| TUI, E2EE thread open (peer key re-check)       | `GetIdentityRoot` + `GetDeviceRoster`          | 30 s                      | `apps/tui/src/screens/MessagesScreen.tsx:422,551`                                                                      |
| TUI, unread **badge**, anywhere while signed in | `NotificationService.GetUnreadCount`           | 60 s (+ on screen change) | `apps/tui/src/hooks/useUnreadCount.ts:5,42,47`                                                                         |
| TUI, **conversation list**                      | `ListConversations`, **once per mount**        | **never refreshes**       | `apps/tui/src/screens/MessagesScreen.tsx:458`                                                                          |
| TUI, thread that is not `E2EE_V1`               | `GetConversation` metadata only                | never                     | `apps/tui/src/screens/MessagesScreen.tsx:465-481`                                                                      |
| Web, unread badge                               | same unread-count query                        | 30 s                      | `apps/web/src/routes/RootLayout.tsx:46`                                                                                |
| Web, DM list + thread                           | `useQuery`, no interval, focus refetch **off** | **never refreshes**       | `apps/web/src/routes/MessagesRoute.tsx:22-25`, `MessageThreadRoute.tsx:22-26`, `apps/web/src/main.tsx:22-30`           |
| Mobile (Expo)                                   | no DM surface, and **no unread badge poll**    | —                         | `apps/mobile/src/screens/` (no DM screen); `apps/mobile/src/screens/NotificationsScreen.tsx:59` (pull-to-refresh only) |

Five facts follow, and together they carry the decision.

1. **In-thread, the TUI is already near-realtime (5 s).** The gap streaming would close is not
   "60 s → instant". It is "60 s → instant _for a user who is not reading the thread_".
2. **The worst freshness defect today is not the poll interval — it is that two surfaces never
   poll at all.** `useKeysetList(true, 'conversations', …)` passes a literal, never-changing
   identity string, so the conversation list and its unread counts are fetched once per mount and
   go stale immediately (`MessagesScreen.tsx:458`; fetch effect at `:205-240`). Web's DM queries
   have no `refetchInterval` and inherit `refetchOnWindowFocus: false` (`main.tsx:22-30`).
   **A streaming RPC would not fix either one** — a stream feeding a list component that never
   re-renders is still a stale list. These are client state-management defects.
3. **The TUI is the only client that can read a DM.** DMs are E2EE-only (`security_mode` is always
   `E2EE_V1`; `E2eeService` is the only send/receive path — `packages/proto/proto/patches/v1/messages.proto:10-27`),
   and web/mobile "have no crypto runtime and cannot start" a conversation
   (`docs/architecture/social.md:206`, ADR 0030/B-111; user-facing at
   `apps/web/src/components/DmNotice.tsx:27-36`). A streaming RPC would push ciphertext faster to
   clients that cannot decrypt it.
4. **The node cannot see message content, so "realtime" here means realtime _metadata_.** The node
   holds only opaque `encrypted_header`/`ciphertext` plus routing metadata, and
   `docs/architecture/e2ee.md:190` already names "mailbox fetch patterns" among the things the node
   learns and product copy must state plainly.
5. **Today's poll is expensive for reasons that have nothing to do with polling.** Per 5 s tick the
   TUI drains the **whole device mailbox** (`limit: 50`, `apps/tui/src/app/e2ee-transports.ts:49`)
   and filters by conversation **client-side**, deliberately leaving other conversations' envelopes
   unacknowledged (`apps/tui/src/e2ee/runtime-session.ts:280-283`) — so they are re-listed on every
   tick, forever. Server-side, each returned envelope triggers its own
   `transcriptDigestForStoredMessage` query pair because the digest is deliberately not persisted
   (`apps/server/src/modules/e2ee/e2ee-conversation.service.ts:416-421`,
   `e2ee-fanout.ts:190-217`) — an N+1. And `listMailboxEnvelopes` has **no rate-limit consume** at
   its controller (`apps/server/src/modules/e2ee/e2ee.controller.ts:216-222`), unlike
   `sendEnvelopes`. A user with 50 envelopes queued from other conversations costs roughly 100
   queries every 5 s against a `DATABASE_POOL_MAX` of 10 (`docs/operations/capacity.md:73`).

### What the spec says, and the state of its gate

§183.3: "Unread state is per-viewer. **Delivery is poll-based like notifications (§56)** — no push
infrastructure before mobile exists." §56: "Do not implement push notification infrastructure until
mobile exists. The TUI can poll when active and refresh manually." Restated in the schema itself:
"Poll-based like every other Patches delivery path (spec §183.3) — there is no push and no stream."
(`packages/proto/proto/patches/v1/e2ee.proto:109-110`).

That gate has **lapsed** — `apps/mobile` exists (ADR 0016 phase E). This ADR does not treat the
lapse as a mandate. §56 never asked for streaming; it asked for polling plus manual refresh, and it
scoped the future unlock to _push infrastructure_ (APNs/FCM), a different mechanism from a
server-streaming RPC. Whether the reference node wants to spend that unlocked budget is an owner
call in the shape of §195.4 — see "Routed to the owner".

### Correcting two stale premises in ADR 0016

ADR 0016 line 18 says "React Native's `fetch` is an XHR polyfill and **cannot stream**
(connect-es#199)", and line 104 says "No server streaming for browsers/RN". Both were true when
written (2026-08-18) and are **no longer true**, verified 2026-08-25 against upstream docs and
connect-es's maintained official example — see `docs/research/connect-streaming.md`:

- Connect server-streaming needs only **HTTP/1.1**; only bidi streaming and the gRPC protocol
  require HTTP/2.
- `@connectrpc/connect-express` — the adapter this node actually uses — **already supports Connect
  server-streaming**. Upstream's wording is that Express "does not support the `http2` module… The
  gRPC protocol and bidirectional streaming RPCs are not supported", which leaves server-streaming
  in scope.
- Browsers support server-streaming (not client-streaming) via `connect-web`.
- Expo SDK ≥ 52 ships a real WinterCG `expo/fetch`; connect-es's official React Native example
  demonstrates a working server-streaming call with it. `connect-es#199` is closed.

**This ADR is therefore not "we can't."** The transport objection is dead, and saying so is part of
the decision: what remains are product and architecture objections, and those are what is being
weighed. (Fly's proxy idle-timeout behaviour for long-lived streams remains **unverified** — see
that note's Fly section. Connect also has no in-protocol heartbeat, unlike gRPC's HTTP/2 PING.)

### What still stands in the way, if we wanted it

- **Amendment B / §4.2.** §4.2 prohibits "addictive notification frequency optimization". Taking
  out-of-thread DM latency from 60 s to sub-second is exactly that dial. §183.3 bans read receipts
  and typing indicators _because they leak presence (§4.2)_; a held server stream leaks the same
  thing in the other direction — the node gains a continuous, second-resolution register of who is
  online. Today's disclosure is "End-to-end encrypted. This node cannot read these messages, but it
  can see who you message and when." (`packages/domain/src/e2ee/modes.ts:163`). Streaming would
  oblige us to extend it to "…and whether you are online, continuously." A uniform poll flattens
  fetch-pattern metadata; a stream sharpens it into a presence beacon.
- **Cross-machine fan-out with no bus.** The server autoscales to 3 machines
  (`infra/fly/fly.toml:141-142`). A `SendEnvelopes` served by machine 2 must wake a stream held on
  machine 1. §12/§153 forbid Redis pub/sub, Kafka, RabbitMQ. That leaves Postgres `LISTEN`/`NOTIFY`
  — pub/sub by another name — or a per-stream database poll, which is client polling with a socket
  and a pool slot added.
- **The rate limiter cannot constrain streams.** Budgets are per-request counts
  (`apps/server/src/common/rate-limit/rpc-budget.ts:27-29`; `read` = 300/actor/min). A `Stream*`
  method already classifies as `read` and would spend **one** token for an arbitrarily long
  connection. Streaming needs a concurrent-stream limiter that does not exist — on top of the
  mailbox RPCs having no budget at all today.
- **Connections are force-cycled by design.** `grpc.max_connection_age_ms` is 30 min
  (`apps/server/src/main.ts:93`, `docs/operations/capacity.md:29`), deliberately, so clients
  rebalance. Any stream is really a ≤30-minute session plus reconnect logic.
- **ADR 0016 §3's edge needs a second code path.** The Connect edge is a byte-level unary proxy
  that throws on any non-unary method
  (`apps/server/src/transport/connect/grpc-proxy.ts:145-151`), backed by a schema-level guard
  (`packages/proto/src/es.test.ts:21-26`). Streaming means `makeServerStreamRequest` forwarding
  plus relaxing both guards — recoverable, but it reopens the per-RPC divergence ADR 0016 exists to
  prevent, for one RPC.
- **512 MB `shared-cpu-1x`** per server machine (`infra/fly/fly.toml:150-153`).

### What polling actually costs

Per signed-in client, against a 300/actor/min `read` budget:

| Client state          | RPC/min | % of read budget | Steady-state rps |
| --------------------- | ------- | ---------------- | ---------------- |
| TUI idle (badge only) | 1       | 0.3 %            | 0.017            |
| TUI, thread open      | ~14     | ~4.7 %           | ~0.23            |
| Web idle (badge only) | 2       | 0.7 %            | 0.033            |

**These are derived from the intervals above, not measured under load.** P19-007's baseline run has
not happened. Stated honestly in the same spirit as ADR 0029's "we have not measured anything yet".
Per-_RPC_ cost is the number that actually matters and it is dominated by fact 5 above, not by the
interval.

The scaling shape cuts both ways: poll cost grows with _connected clients ÷ interval_, streaming
cost grows with _actual messages_. At ~1,000 concurrent open threads, 5 s polling is ~230 rps of
mostly-empty mailbox reads across at most three `shared-cpu-1x` machines — and today each of those
reads is an N+1. Patches is pre-alpha with effectively zero concurrent DM users; the crossover is
three orders of magnitude away, and the cheap half of it is a query fix (P19-019), not a protocol
change.

## Decision

**Defer streaming. DM delivery stays poll-based for v0. No streaming RPC enters the schema, and the
unary-only guards in `packages/proto/src/es.test.ts` and
`apps/server/src/transport/connect/grpc-proxy.ts` stay as they are.**

In exchange, the polling behaviour stops being an accident and becomes a stated commitment — one
the current implementation **does not yet meet**.

### 1. The DM freshness SLA (what a user is promised)

A commitment on the reference node's default configuration, to be published in
`docs/architecture/api.md` and `docs/architecture/social.md`. This is the ceiling on what client
copy may imply — no more.

| Situation                                          | Promise                                               | Meets it today?                                                 |
| -------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| Conversation open in the TUI                       | new messages appear within **~5 s** + one RTT         | **yes** (`MessagesScreen.tsx:424`)                              |
| Signed in to the TUI, elsewhere in the app         | unread badge updates within **60 s**                  | **yes** (`useUnreadCount.ts:5`)                                 |
| Sitting on the TUI conversation list               | list + per-conversation unread update within **60 s** | **no — never refreshes** (P19-017)                              |
| Signed in on web (badge only; web cannot read DMs) | unread badge updates within **30 s**                  | **yes** (`RootLayout.tsx:46`)                                   |
| Web conversation list / thread metadata            | updates within **60 s** while the tab is focused      | **no — never refreshes** (P19-017)                              |
| Mobile                                             | **no DM delivery signal at all**; say so              | n/a — no DM surface, no badge poll                              |
| Client closed, backgrounded, or offline            | **nothing arrives. Patches does not push.**           | yes, by construction                                            |
| A poll fails                                       | last-known state stays; next tick retries             | yes in-thread and for the badge; **not for the list** (P19-017) |

Three invariants attach:

- **A failed poll never renders as "no messages."** Already the house rule in-thread and for the
  badge (`useUnreadCount.ts:36-38`, `MessagesScreen.tsx:566-570,584-587`). P19-017 extends it to
  the conversation list, whose "No conversations yet." (`MessagesScreen.tsx:856-858`) is currently
  unqualified.
- **No client string may imply push, live, instant, or realtime delivery**, in any surface
  including marketing. Today no string does — except one: `Ctrl+R`'s keymap description, "Refresh
  from the server — re-reads like/bookmark state and shows what is new", scoped `on: 'global'`
  (`apps/tui/src/app/keymap.ts:324-331`), while `manualRefresh()` only bumps `feedNonce` for feed
  screens and `MessagesScreen` receives no `refreshKey` (`App.tsx:1450-1457, 2361-2378`). That is
  a real over-promise; P19-016 fixes it.
- **Manual refresh must actually exist on every DM surface**, per §56's "and refresh manually".
  Today it does not (no `r` binding on the messages list, `MessagesScreen.tsx:748-785, 872-874`).
  P19-016/P19-017 wire `Ctrl+R` — the **existing** documented key — through to DM screens rather
  than adding a new binding, which §194's "rebind an existing documented TUI key to a new feature"
  prohibition requires.

### 2. The re-open gate (measured, not a vibe)

Streaming is reconsidered when **any one** of these is observed. Each needs P19-020's instrument or
P19-007's baseline to be checkable at all; until then they are proposed gates, not validated
thresholds — ADR 0029's framing, deliberately reused.

- **T1 — latency.** p95 wall-clock from `SendEnvelopes` commit to the recipient's first
  `ListMailboxEnvelopes` that returns the envelope exceeds **90 s**, sustained over a rolling
  7 days, _after_ P19-017 lands. (Not "someone felt it was slow.")
- **T2 — load.** DM/notification poll RPCs exceed **25 %** of the node's total `read` RPC volume
  **and** `ListMailboxEnvelopes` p95 server-side duration exceeds **250 ms**, sustained over a
  rolling 7 days, _after_ P19-019 lands. Measuring T2 before the N+1 and the whole-mailbox drain
  are fixed would measure our bugs, not polling.
- **T3 — a client that can actually use it.** A DM-capable client ships that cannot poll (a
  backgrounded mobile app). The correct answer there is **platform push (APNs/FCM) with a
  content-free wake payload** — the thing §56 actually gated on mobile existing — **not** a
  streaming RPC. Own ADR, owner sign-off: a push payload is a new place DM metadata leaves the node
  (§183.4, §194).

Tripping a trigger opens a new ADR. It does not authorize implementation.

### 3. Scope explicitly excluded

Nothing here authorizes presence, typing indicators, read receipts, delivery receipts, or
online/last-seen state. §183.3 and §194 prohibit them; B-093 gates anything adjacent. The absence of
a persistent connection is part of _why_ those stay easy to keep out, and a future streaming ADR
must re-argue them from scratch rather than inheriting them.

### 4. Reversibility

Nothing to roll back: this decision ships no code and no schema change. Its reversal cost is one
ADR plus the work ADR 0016's guards already force into the open. The intervals are single constants
per client (`useUnreadCount.ts:5`, `MessagesScreen.tsx:422,424`, `RootLayout.tsx:46`), so tightening
the SLA is a one-line change, not a migration — P19-021 centralizes them so the published SLA has
exactly one source of truth and drift fails a test.

## Consequences

**Positive**

- The node keeps no long-lived per-user connection, so it holds no continuous presence register.
  That is a privacy property, not merely an omission, and it stays consistent with §183.3's stated
  reason for banning read receipts.
- The Connect edge stays a single generic byte-level proxy with zero per-RPC handlers; both
  unary-only guards keep earning their place.
- No `LISTEN`/`NOTIFY`, no bus, no §12/§153 pressure, no new per-connection pool slot against
  `DATABASE_POOL_MAX = 10`, no concurrent-stream limiter to invent.
- Freshness becomes a written promise instead of an emergent property of unrelated `setInterval`
  constants — and writing it down is what surfaced that two surfaces never refresh at all.
- The cheap fixes (P19-017, P19-019) buy more real freshness and more headroom than streaming
  would, at a fraction of the cost and risk.

**Negative — stated plainly**

- **A user not looking at the thread learns about a DM up to 60 s late.** Worse than every
  mainstream messenger, and a deliberate choice.
- **Nothing arrives while the client is closed.** Patches is not a background messenger and must
  not be sold as one. On mobile there is currently no arrival signal whatsoever.
- **The SLA above is aspirational for two surfaces until P19-017 lands.** This ADR publishes a
  promise the code does not yet keep; that gap is tracked, not hidden, and no client copy may claim
  the promise before the code meets it.
- Poll cost scales with connected clients rather than with messages, and we have not measured where
  the crossover is.
- ADR 0016's stale RN/browser streaming claims are corrected here but not rewritten there — an ADR
  is a dated record and editing it in place would erase why it said what it said. P19-023 adds the
  pointer.
- If a mobile DM client ever ships, this decision must be revisited before that client is useful,
  not after.

## Alternatives considered

- **(a) Server-streaming `StreamMailboxEnvelopes` now, with unary `ListMailboxEnvelopes` as the
  mandated fallback.** Technically viable — the transport research says so plainly. Rejected
  because it would serve exactly one client (the TUI) which already polls at 5 s in-thread, would
  push ciphertext faster to clients that cannot decrypt it, would not fix either surface that never
  refreshes, would create a server-side presence signal the spec bans by analogy, needs a
  cross-machine wake mechanism §153 forbids, and needs a concurrent-stream limiter that does not
  exist. Real work, for a latency win Amendment B does not want.
- **Postgres `LISTEN`/`NOTIFY` as the fan-out spine.** Not literally banned by §12 (which names
  Redis, BullMQ, RabbitMQ, Kafka). Rejected on intent, not on the letter: it is pub/sub, it is
  un-ACKed and lossy across reconnects, it costs a dedicated connection per process against a pool
  of 10, and adopting it to dodge a naming technicality is exactly the reinterpretation CLAUDE.md
  forbids. If it is ever right it deserves its own ADR arguing for it on merit.
- **Long-poll / hanging `ListMailboxEnvelopes` with a server-held deadline.** No schema change, no
  new transport, works on every client. Rejected now: it holds a request and a pool slot per
  waiting client for the same presence-leaking effect as a stream, and
  `grpc.max_connection_age_ms` plus Fly's unverified idle behaviour make its timeout semantics
  unpredictable. **It is the option to revisit first if T1 or T2 trips**, because it is by far the
  smallest change — recorded here so the next ADR starts from it rather than from streaming.
- **Just tighten the intervals** (60 s → 15 s badge, 5 s → 2 s in-thread). Rejected as the default:
  it multiplies poll load 3–4× — on top of an N+1 — to chase a latency target nobody has asked for,
  before anything has been measured. It stays the cheap dial if T1 trips without T2.
- **Fix the polling instead** (P19-017 list refresh, P19-019 server-side conversation filter +
  kill the N+1 + add a budget). **Chosen**, as the substance of this deferral. It closes the actual
  user-visible freshness gap and removes the load argument that would otherwise force T2, without
  touching the schema, the transport, or §153.
- **Platform push (APNs/FCM) now.** §56's gate has lapsed, so this is no longer prohibited.
  Rejected as premature: `apps/mobile` has no DM surface at all, and a push payload is a new egress
  point for DM metadata needing owner sign-off (§195-class) and its own ADR. Recorded as T3.

## Routed to the owner

Two things this ADR deliberately does not decide:

1. **Whether the reference node wants sub-minute DM delivery as a product promise.** This ADR sets
   the engineering default from the evidence. If the product intent is "Patches DMs feel instant",
   that is an owner statement which reopens the decision immediately, and it should be made
   explicitly rather than discovered through a bug report. It sits beside §195.4 (whether the
   reference node enables DMs at launch).
2. **Spending the lapsed §56/§183.3 push budget.** Mobile exists, so "no push infrastructure before
   mobile exists" no longer prohibits anything. Nothing should walk through that door without the
   owner deciding to open it, an ADR, and the §183.4/§194 metadata analysis a push payload requires.

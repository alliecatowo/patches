# Federation

**Status: F1 implemented (local lab only), off by default.** Phase 8 (P8-001..P8-008) built
the two-node lab described in §4's Stage F1: WebFinger, actor documents, inbox/outbox, `Follow`
/`Accept`/`Undo`/`Create`/`Update`/`Delete`/`Like`, HTTP Signatures, SSRF/ingestion hardening,
in-process telemetry counters (A-036), and a two-real-process integration test
(`apps/server/test/federation-two-node.integration.test.ts`). Phase 18 (P18-001..009,
2026-08-22–25) extended that same lab to federate three Amendment B features — reposts, tags,
quotes — under [ADR 0028](../decisions/0028-federating-social-depth.md); see §7.6 below.
Communities stay local-only in v0 (the `Group`-actor pattern is unverified and deferred to its
own ADR) and DMs never cross the federation seam at all, encrypted or not (ADR 0020 §13).
None of it is reachable unless an operator sets `FEDERATION_ENABLED=true` — every node still
ships with federation off by default (§176), and Stage F2/F3 (Mastodon interoperability, public
federation, §160's full readiness checklist) remain **not started**. This document describes the
node model, the architectural seam that keeps federation possible without coupling domain code
to ActivityPub, and the staged rollout that must be followed before any real network federation
is enabled. Source of truth: `INITIAL_VISION.md` §19, §21, §91, §105–110, §160, and
**Amendment A §163–§164, §176**.

Guiding rule (§0, §161), unchanged by Amendment A: **do not implement federation before the
centralized product works.** Federation is modeled correctly from day one so it can be
earned later, not bolted on.

> **Amendment A changed this document.** Patches is node software; `patches.social` is the
> reference node, not "the backend". The federation lab moves from 0.5 to **v0.1**, and every
> §109 security gate stays exactly where it was. See ADR
> [0013](../decisions/0013-node-model-and-earlier-federation.md).

## 0. The node model (§163)

Patches is **social-server software**. A deployment is a **node**. `patches.social` is the
flagship hosted node — the **reference node** — not "the backend", and no doc, identifier, or
comment may describe it as such.

- Identity is `@handle@domain`. A handle is unique **within a node** only.
- Each node is authoritative for its own local actors and nothing else.
- There is **no** global user database, central account service, central directory, or
  registry a node needs in order to function. A node must be fully operable standalone.
- A node's identity is its canonical domain (§91) — one node, one domain, fixed before
  federation is enabled.
- Nodes publish their own policy (registration mode, limits, capabilities) via `GetNodeInfo`
  rather than clients hardcoding the reference node's behavior.

Self-hosting is a shipped goal (v0.2): `docker run`/Compose, documented environment, no
proprietary dependency — any S3-compatible object store, any SMTP endpoint.

**A self-hosted node ships with federation disabled by default**, and federation must not be
enabled on any node until the §109 controls exist in that build. Shipping the software to
other operators does not lower the federation security bar; it raises it, because the
operator inherits it.

## 0.1 Identity portability seam (§164)

`actors.moved_to_uri` and `actors.also_known_as` exist from the Phase 1 schema and are
**unused until v0.4**. An actor with `moved_to_uri` set is read-only. A move is honored only
when the destination actor claims the origin actor in `also_known_as` — a one-sided claim is
never trusted.

Protocol accuracy (verified 2026-08-17): `Move` **is** a standard ActivityStreams 2.0 activity
type (https://www.w3.org/TR/activitystreams-vocabulary/). `movedTo` and `alsoKnownAs` are
**not** — they are Mastodon-originated properties documented non-normatively by the W3C
SocialCG (https://swicg.github.io/miscellany/), with FEP-7628 an in-progress attempt to
formalize them. Our columns are named in our own terms and mapped to the community property
names only at the federation boundary; nothing in the codebase may describe them as standard
ActivityStreams.

Data **export** is independent of federation and is never gated behind a capability, tier, or
payment: profile, posts, media manifest, page document, and social graph.

## 1. The seam: `FederationGateway`

A module/interface boundary exists from the beginning so domain services never
depend directly on ActivityPub structures (§105). Implemented in `apps/server/src/modules/
federation/federation-gateway.ts`, extended past the spec's original three-method sketch to
cover Follow/Like (Stage F1 needs those delivered too, spec §108):

```ts
interface FederationGateway {
  publishPost(manager, postId): Promise<void>;
  publishDelete(manager, postId): Promise<void>;
  followRemoteActor(manager, followerActorId, targetActorId): Promise<void>;
  unfollowRemoteActor(manager, followerActorId, targetActorId): Promise<void>;
  likeRemotePost(manager, actorId, postId): Promise<void>;
  unlikeRemotePost(manager, actorId, postId): Promise<void>;
}
```

Bound to `LazyFederationGateway` (`federation.module.ts`), which dispatches to
`ActivityPubFederationGateway` or `NoopFederationGateway` **per call**, reading
`AppConfigService.federationEnabled` fresh every time rather than once at DI-construction time
— load-bearing for running more than one differently-configured node in one process (see the
doc comment on `LazyFederationGateway` and on `apps/server/test/support/federation-node.ts` for
why). `GraphService.followActor`/`unfollowActor`, `PostService.createPost`/`deletePost`, and
`ReactionsService.likePost`/`unlikePost` call the gateway inside the same transaction as their
local write, so a federation delivery is enqueued (as a durable `FEDERATION_DELIVER` outbox
job, `apps/worker/src/jobs/handlers/federation-deliver.handler.ts`) atomically with the local
write that caused it.

## 2. Federation target

First (and only currently planned) federation target: **ActivityPub**, a W3C
Recommendation built on ActivityStreams 2.0 — not AT Protocol (§106).

References:

- https://www.w3.org/TR/activitypub/
- https://www.w3.org/TR/activitystreams-core/
- https://www.w3.org/TR/activitystreams-vocabulary/

## 3. WebFinger (§107)

Fediverse actor discovery requires WebFinger-style discovery per RFC 7033:

- https://datatracker.ietf.org/doc/html/rfc7033

The W3C Social Web community documents WebFinger specifically in ActivityPub
discovery contexts — required reading before Stage F1 implementation.

## 3.5 Release mapping (§176)

| Release | Contents                                   | Stage |
| ------- | ------------------------------------------ | ----- |
| v0.0    | Single-node social loop (Phases 0–7 + 4.5) | F0    |
| v0.1    | Two-node Patches↔Patches federation lab    | F1    |
| v0.2    | Self-hostable node release                 | F1    |
| v0.3    | Mastodon/Pixelfed interoperability         | F2    |
| v0.4    | Identity portability / migration           | F2    |
| v1.0    | Public federation                          | F3    |

## 4. Stages (§108)

### Stage F0 — schemas only (current status)

Centralized system. The data model already understands:

- local/remote actor possibility (`actors.is_local`, `user_id` nullable),
- canonical URIs (`actors.canonical_uri`, `posts.canonical_uri`),
- origin (`actors.home_server`, `posts.origin_server`),
- tombstones (soft-delete on `posts`/`actors`),
- visibility (`posts.visibility`).

No remote HTTP requests are made. `NoopFederationGateway` is the only
implementation.

### Stage F1 — two-node lab (**v0.1**, Phase 8) — implemented

Run two Patches nodes locally. **Local and non-public** — this is §108's Stage F1 verbatim,
moved earlier in the release sequence, not loosened. Implemented (P8-001..P8-008):

- WebFinger (`GET /.well-known/webfinger`, RFC 7033),
- actor document serialization (`GET /users/:handle`, `Person`, `publicKey`, `patches:
pageManifest` extension — §170, see §7.5 below),
- inbox/outbox endpoints (`POST /users/:handle/inbox`, `POST /inbox` shared, `GET /users/
:handle/outbox`),
- `Follow` (auto-accept, matching v0's "local accounts transition straight to FOLLOWING"
  policy extended to remote followers),
- `Accept` (for our own outgoing follows — stays `PENDING` until received),
- `Create` (Note),
- `Update` (A-035 — see below),
- `Delete` (tombstone),
- `Like`/`Undo(Like)`.

Plus durable delivery: `FEDERATION_DELIVER` outbox jobs (`docs/architecture/jobs.md`) carry
deliveries with bounded retries (12 attempts, exponential backoff, then `DEAD`), and duplicate
delivery is safe both ways — `InboxActivity` dedupes by activity id on the receiving side, and
the `(activityId, inboxUrl)` pair is the outbox job's own idempotency key on the sending side.
And in-process telemetry (A-036, `apps/server/.../federation-metrics.service.ts` and its worker
mirror `apps/worker/src/federation/delivery-metrics.ts`) — see §5's telemetry row below.

#### `Update` semantics (A-035, §160)

`InboxService.handleUpdate` dispatches on `activity.object.type`:

- **`Note`** — edits the matching local `Post` row (looked up by `canonicalUri = object.id`,
  the same row `handleCreate` inserted) only when the caller is that post's own author and it
  is not already deleted; sets `body` (same 5,000-char cap as `Create`) and `editedAt`. An
  `Update` from anyone but the author, or targeting a `canonicalUri` this node never ingested,
  is a silent no-op — never an error, matching every other unrecognized-shape branch in this
  file.
- **`Person`/`Service`/`Group`/`Organization`/`Application`** (an actor profile update) —
  refreshes this node's cached copy of the _sending_ actor only. `object.id` must equal the
  activity's own signed `sender.canonicalUri` exactly; a remote peer's valid signature does
  not entitle it to describe (or poison the cache of) any other actor. The refresh re-fetches
  through `RemoteActorService.getOrFetchByUri(..., { forceRefetch: true })` — this node trusts
  what the remote actor's _own_ document currently says, never the fields embedded in the
  `Update` activity itself.
- Anything else in `object.type` is ignored.

No `Update` for a `Page` (P8-007's Page-manifest extension) exists yet — a Page edit is only
ever visible to a remote peer via a fresh `GET /users/:handle/page` fetch, not pushed.

Only reachable when `FEDERATION_ENABLED=true` (default off, §176) — that flag gates the entire
HTTP listener in `main.ts`, not just individual routes, so a node with federation disabled has
_zero_ new network surface, not a smaller one.

No Mastodon-compatibility goal yet — the objective is proving Patches-to-Patches federation
works end to end, verified by `apps/server/test/federation-two-node.integration.test.ts`
(two real child processes, real HTTP-Signature-signed loopback HTTP). Testing federation
assumptions here, four releases earlier than originally scheduled, is the entire point: a
wrong actor/URI/delivery assumption is cheap to fix now and expensive later.

Known F1-scope gaps, left for a follow-up rather than blocking the lab:

- `followers`/`following` AS2 collection endpoints are advertised on the actor document but
  not yet served (a remote peer fetching them gets a 404);
- avatar `icon` is never populated on the actor document (no public media URL resolver
  wired in yet).

Resolved since the list above was first written: the outbox now serves a real keyset-paginated
`OrderedCollection`/`OrderedCollectionPage` (B-027, `OutboxCollectionService.buildCollection`/
`buildPage`); outbound delivery consults `domain_blocks` both at enqueue
(`DeliveryService.enqueue`) and again at delivery time
(`apps/worker`'s `FederationDeliverHandler`, in case a domain was blocked after a job was
already queued); `domain_blocks` has a write path (`patches-admin domain block|unblock|list`,
audited, B-027); and `federation_keys.private_key_pem` is encrypted at rest with AES-256-GCM
under an operator-supplied `FEDERATION_KEY_ENCRYPTION_KEY` rather than stored plain (B-026,
`packages/database/src/crypto/federation-key-cipher.ts`) — previously a documented, deliberate
v0.1 gap (`FederationKey`'s doc comment used to explain why), now closed before any real
federation is enabled; and `ActivityPubFederationGateway`'s own recipient-resolution queries
(§201.5, P14-013) now additionally filter on `domain_blocks` — `remoteFollowerInboxes` (posts),
`loadPair` (`Follow`/`Undo Follow`), and `buildLikeUndoLike` (`Like`/`Undo Like`) each drop a
blocked domain's actor before an inbox URL is ever built, not only at `DeliveryService`'s later
pre-delivery check — previously a documented gap in `DomainBlockService`'s own doc comment
("`ActivityPubFederationGateway`'s recipient-resolution queries would need to additionally
filter on this to fully close the outbound half"), closed as a second, independent check on
top of (not a replacement for) `DeliveryService.enqueue`'s existing filter. Covered by
`apps/server/src/modules/federation/services/activitypub-federation-gateway.service.test.ts`.

Also resolved: outbound `Follow`/`Like` used to mint a fresh `randomUUID()` for the inner
activity every time `Undo` was built, instead of naming the original `Follow`/`Like`'s id — a
peer has no way to match an `Undo` against an activity id it has never seen, so the unfollow/
unlike could silently fail to take effect remotely (B-079). Fixed the same way ADR 0028 §4
already required for reposts: the inner id is **deterministic**, reconstructed rather than
looked up, via `localDeterministicActivityUri(origin, 'follow' | 'like', actorUri, objectUri)`
(`apps/server/src/modules/federation/activity-ids.ts`) — a SHA-256 of the activity kind plus
the local actor's own (immutable, handle-derived) URI and the remote object's (immutable)
`canonicalUri`. Unlike a repost's `Announce` id, which is reconstructed from the `reposts` row's
surrogate id, `Follow`/`Like` have no row left to reconstruct from by undo time (`follows` rows
are hard-deleted on unfollow; `likes` has no surrogate id at all, only its composite PK), hence
the content-hash derivation instead of a row-id one. The derivation is a wire contract — see the
doc comment on `localDeterministicActivityUri` before changing it. Covered by the same test
file's "B-079: outbound Follow/Like Undo names the original id" suite.

### Stage F2 — interoperability (**v0.3–v0.4**, Phases 10–11)

Test against mainstream ActivityPub implementations (e.g. Mastodon). Implement:

- discovery robustness,
- HTTP signing compatible with ecosystem expectations,
- remote actor caching,
- remote object ingestion,
- retry,
- deduplication,
- blocklist,
- domain moderation.

### Stage F3 — public federation (**v1.0**, Phase 12)

Only enabled after all of:

- abuse controls,
- SSRF protection,
- signature verification,
- job retries,
- tombstones,
- remote deletion handling,
- monitoring,
- domain controls.

See the full readiness checklist in §5 below (mirrors spec §160).

## 5. Federation readiness checklist (§160)

Federation is **not** publicly enabled until (updated after Phase 8 — F1 items are proven in
the local lab; F2/F3-only items below remain open, and none of this changes the default-off
posture):

- [ ] stable canonical domain selected
- [x] WebFinger works _(local lab, P8-001)_
- [x] actors serialize correctly _(local lab, P8-001)_
- [ ] ActivityStreams objects validate _(no formal AS2/JSON-LD schema validation — shape-
      checked only, e.g. `id`/`type`/`actor` presence)_
- [x] inbox works _(local lab, P8-002)_
- [x] outbox works _(local lab, P8-002; real keyset `OrderedCollectionPage` pagination as of
      B-027, `OutboxCollectionService.buildPage`)_
- [x] `Follow` works _(local lab, P8-002)_
- [x] `Accept` works _(local lab, P8-002)_
- [x] `Create` works _(local lab, P8-002)_
- [x] `Delete` works _(local lab, P8-002)_
- [x] `Update` semantics decided _(A-035 — `Note` edits by author, actor-profile refresh
      scoped to the activity's own signed sender; see §4's "`Update` semantics" above)_
- [x] deliveries are durable _(P8-004, `FEDERATION_DELIVER` outbox jobs)_
- [x] duplicate delivery is safe _(P8-004/P8-006 — inbox dedupe + delivery idempotency key)_
- [x] retries are bounded _(P8-004 — 12 attempts, exponential backoff, then `DEAD`)_
- [x] signatures verified _(P8-005, draft-cavage-http-signatures-12)_
- [x] SSRF defenses exist _(P8-006, `safeFetch`/`isDisallowedIp`)_
- [x] remote response sizes bounded _(P8-006, `safeFetch` byte cap)_
- [x] remote request timeouts exist _(P8-006, `safeFetch` 10s timeout)_
- [x] domain blocking exists _(B-027: `domain_blocks` enforced on inbound in `InboxService`;
      `DeliveryService.enqueue` filters outbound at enqueue time, and `FederationDeliverHandler`
      re-checks at delivery time — see §4 and §7. P14-013 additionally closed the
      recipient-resolution gap: `ActivityPubFederationGateway` itself now filters on
      `domain_blocks` before ever building an inbox URL, not only at those two later checks)_
- [x] remote delete/tombstones work _(local lab, same as `Delete` above)_
- [x] moderator can block remote server _(B-027: `patches-admin domain block|unblock|list`,
      audited)_
- [x] federation telemetry exists _(A-036 — in-memory counters, `GET /federation/metrics`
      loopback-only, periodic structured log; B-030 adds the same periodic log on `apps/worker`;
      `docs/operations/federation.md` "Metrics")_
- [x] two Patches servers interoperate _(P8-008, `federation-two-node.integration.test.ts`)_
- [ ] at least one mainstream Fediverse implementation interoperates _(F2 scope, not started)_

## 5.5 Domain-policy transparency (§197.6, §201.4, §201.5) — implemented (P14-012)

A node's federation domain policy is publishable, not merely enforced. Two RPCs cover it,
both documented in full in [`api.md`](./api.md):

- `NodeService.GetNodePolicy` (unauthenticated, cacheable) publishes each `domain_blocks` row
  as a `domain_policies` entry — `action = BLOCK` (v1 ships only this one action; a graduated
  `limit`/`silence` tier is a recorded, not implemented, §210 sign-off item, same restraint
  §201.5 states) plus a bounded, published `reason_category` (never the operator's free-text
  `domain_blocks.reason`, which stays internal). `apps/server/src/modules/system/node.service.ts`
  maps `domain_blocks` rows straight onto this response.
- `ModerationService.ListModerationLog` (unauthenticated, keyset-paginated over
  `moderation_log_entries`) carries fully-identified domain-kind rows — `patches-admin domain
block` writes a `DOMAIN_BLOCK` entry naming the domain — alongside account/post/media rows,
  which stay anonymized by construction (no actor-id/post-id column exists on that table to
  leak). See `api.md`'s `ModerationService` section for the full entry-kind breakdown.

**This transparency surface must not be read as a stronger enforcement guarantee than the code
provides.** §201.5's own text: outbound delivery has been filtered on `domain_blocks` at
enqueue and pre-delivery since B-027, and `ActivityPubFederationGateway`'s recipient-resolution
queries additionally filter on `domain_blocks` as of P14-013 (§4's Stage F1 section above) — so
as of this doc the outbound gap the spec flagged is closed. If a future change to recipient
resolution reopens a gap between "what `GetNodePolicy` publishes" and "what delivery actually
filters", that is a bug to fix or a fact to disclose here, not something to leave the published
policy silently overstating.

## 6. Federation security (§109)

Federation means ingesting hostile Internet input. Before any Stage F1+ work ships
to production, the system must:

- validate remote URLs,
- reject private/reserved IP ranges,
- defend against DNS rebinding,
- limit redirects,
- limit response size,
- enforce timeouts,
- validate content types,
- cap JSON depth/size,
- deduplicate activities,
- verify signatures,
- rate limit remote inboxes,
- maintain domain blocks.

A remote actor is never trusted merely because it speaks ActivityPub.

## 7. Persistence mapping (§110) — implemented (Phase 8)

Remote entities fit the **existing** tables, as designed — federation did not require a
parallel schema. `RemoteActorService` (`apps/server/src/modules/federation/services/
remote-actor.service.ts`) upserts:

`ActorService.ResolveActor` (B-028, `actors.proto`) is the client-facing entry point onto this
same path: given `acct:user@domain`, it calls `RemoteActorService.resolveByAcct` and returns
the (possibly newly-discovered) remote actor so a TUI client can immediately
`SocialGraphService.FollowActor` it — `NOT_IMPLEMENTED` when `FEDERATION_ENABLED=false`, and
rate-limited per caller (`ActorResolveRateLimitService`) since each call is a real outbound
fetch to a caller-named host.

Remote actor:

```text
actors.is_local = false
user_id = null
canonical_uri = remote actor URI
home_server = remote hostname
```

plus the Phase 8 columns that round this out: `actors.public_key_pem` (cached, refetched on
signature-verification failure), `actors.shared_inbox_uri`, `actors.last_fetched_at`.

Remote post (`InboxService.handleCreate`):

```text
posts.is_local = false
canonical_uri = remote object URI
origin_server = remote hostname
```

A **local** actor/post's own federation URI is the opposite of persisted: it is computed on
demand from `PUBLIC_ORIGIN` (`activitystreams/uris.ts`'s `localActorUri`/`localPostUri`), never
written to `canonical_uri` — that column stays reserved for exactly what its doc comment
already said (null until a stable production domain exists). Only a genuinely **remote**
object's own URI is ever written there.

Two new tables round out the schema (`Phase8Federation` migration): `federation_keys` (one
RSA-2048 keypair per local actor that has ever signed something, created lazily) and
`inbox_activities` (activity-id dedupe, P8-006) — plus `domain_blocks` (§109's blocklist,
read-only from the application today; see §4's Stage F1 gaps).

The original ActivityStreams JSON payload is **not** stored anywhere (not even for remote
posts) — a deliberate v0.1 simplification consistent with §110's "raw ActivityStreams JSON is
never the application's primary domain model"; a bounded JSONB debugging column remains a
plausible future addition, not a current gap that blocks anything.

## 7.5 Pages over federation (§170)

An actor's **Page** manifest is advertised as a **Patches extension property** on the actor
document. A plain Fediverse server that does not understand the property receives an ordinary
actor and loses nothing — the extension is additive and never required for basic
interoperability.

The page document itself remains inert data (§172): federating a Page never federates
executable code, which is what makes rendering a remote actor's page no more dangerous than
reading a remote post. Remote page documents are subject to the same §109 ingestion rules as
any other remote input — bounded size, validated content type, capped JSON depth — and to the
same strict-on-write validation as local documents.

## 7.6 Amendment B mapping (§193) — **Status: decided (ADR 0028), Phase 18 implemented (P18-001..009), off by default**

Amendment B (§178–§195) added reposts, quotes, tags, communities and DMs as **local,
single-node** features. Phase 18 federates the first three, in that order, under
[ADR 0028](../decisions/0028-federating-social-depth.md) (2026-08-22): reposts map to
`Announce`/`Undo(Announce)` with **deterministically reconstructed** outbound activity
ids; tags map to `as:Hashtag`; quotes map to FEP-044f with new + legacy properties emitted
and all four accepted inbound, unknown shapes as silent no-ops. Communities stay
**local-only** in v0 and DMs never cross the federation seam at all — neither is affected
by anything below. This section still moves **no** §109 gate and **no** §160 checklist
item above — the checklist is unchanged by Amendment B and by Phase 18; Phase 18 remains
reachable only when `FEDERATION_ENABLED=true`, same as every other Stage F1 surface.

Landed, in dependency order (all behind the same off-by-default flag, all covered by the
two-node lab — `docs/operations/federation.md`'s "Two-node lab (P18-008)" section):

- **P18-002** — schema: `reposts.remote_activity_uri` (nullable, unique-indexed — links a
  remote `Announce` to the local pointer row so a remote `Undo` can find it) and
  `quote_authorizations` (the FEP-044f authorization lifecycle table). See §7.6.1 below.
- **P18-003** — outbound reposts: `FederationGateway.announceRemotePost`/
  `unannounceRemotePost` (`activitypub-federation-gateway.service.ts`,
  `reaction.service.ts`), emitting `Announce`/`Undo(Announce)` with the id
  `localRepostAnnounceUri` reconstructs from the repost row (`activity-ids.ts`) —
  never `randomUUID()` (B-079's failure mode, deliberately not repeated).
- **P18-004** — inbound `Announce`/`Undo(Announce)` (`InboxService.handleAnnounce`/
  `handleUndoAnnounce`, `inbox.service.ts`): re-checks §180.1 eligibility and
  block/mute/domain-block at ingest, links the local repost row's
  `remote_activity_uri`, and ingests a remote post's `tag` array through the same local
  Hashtag grammar a local post uses — a grammar failure drops the tag, never the post.
- **P18-005** — `RemoteObjectService` (`remote-object.service.ts`): fetch-by-URI for
  quote resolution, content-type-validated (`application/activity+json`/`ld+json`),
  bounded-JSON, TTL-cached with a negative cache for 404/410, per-origin rate limit,
  built on the existing `safeFetch` SSRF/rebinding defenses (§109) rather than a parallel
  fetch path; refuses any DM-path caller before ever making a request.
- **P18-006** — outbound tags + quotes (`activitystreams/documents.ts`'s
  `buildNoteObject`): emits `tag: [Hashtag]` from `post_tags` in deterministic
  `(created_at, tag_id)` order, and — for a quote post — `quote` plus the legacy
  `quoteUri`/`quoteUrl`/`_misskey_quote` properties together; `quote_policy` maps onto
  `interactionPolicy.canQuote` (`ANYONE`→`as:Public`, `FOLLOWERS`→the followers
  collection, `NOBODY`→the author URI only — no invented `following` value).
- **P18-007** — inbound quotes (`InboxService`'s quote branch): reads
  `quote`>`quoteUri`>`quoteUrl`>`_misskey_quote` in first-recognizable-wins precedence,
  resolves the quoted object through P18-005 only, and enforces §180.2 — an
  unverifiable, policy-violating, or blocked-author quote ingests as a **plain post**,
  never an endorsed one. Records a `quote_authorizations` row
  (`PENDING`/`VERIFIED`/`REJECTED`) on receipt; a self-quote links with no row
  (FEP-044f auto-approves those).
- **P18-008** — two-node lab round trip proving the above: repost/unrepost
  `Announce`/`Undo(Announce)` id stability across an actual process restart of node A,
  and quote-of-remote plus local-from-remote quote linkage (each recording a `VERIFIED`
  `quote_authorizations` row). **Found a real bug, since fixed (P18-011)**: the tag-feed arm of
  the same round trip failed because `PostService.createPost` called
  `federation.publishPost` before `tagExtraction.extractAndAttach`, so a federated
  post's `post_tags` were always empty at publish time and no Hashtag ever reached a
  peer. `handleAnnounce`/`handleCreate` (P18-004/P18-007) were unaffected and correct.
  P18-011 swapped the two calls and added a unit-level ordering guard; all four
  round-trip cases now pass. See `docs/operations/federation.md` for the transcript.
- **P18-009** — TUI rendering: remote-repost/remote-quote attribution and the one-level
  quote-embed nesting bound, both client-only and unaffected by that bug (they
  render whatever tags a post already has). Web equivalent tracked as B-180.

The verified protocol detail, with citations and verification dates (re-verified
2026-08-22 for reposts/quotes/tags and the `Group` questions), lives in
**`docs/research/activitypub-social-depth.md`**. Summary:

| Feature     | ActivityPub shape                                                                                                              | Footing                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Repost      | `Announce` of the object; `Undo(Announce)` to unrepost                                                                         | W3C Recommendation                                                       |
| Quote       | FEP-044f `quote` + `quoteAuthorization` + `QuoteRequest`/`Accept`/`Reject`, plus legacy `quoteUri`/`quoteUrl`/`_misskey_quote` | FEP **draft**; Mastodon 4.4 reads, 4.5 authors (automatic approval only) |
| Tags        | `Hashtag` entries in `tag` (an AS2 **extension** term, not in the Recommendation)                                              | de facto convention                                                      |
| Communities | `Group` actor that `Announce`-wraps member activities (FEP-1b12, Lemmy/Mbin)                                                   | FEP final, implementation docs thin                                      |
| DMs         | `Note` addressed to recipients only — no `as:Public`, no follower collection                                                   | W3C Recommendation                                                       |

Six things that are settled and must not be re-litigated per feature:

- **DMs do not federate in v0** (§183.4, §194), and ADR
  [0020](../decisions/0020-e2ee-direct-messages.md) §13 extends that to E2EE explicitly:
  no DM key, prekey, envelope, report, or delivery path crosses the `FederationGateway`,
  even when social features federate. Federated DMs remain a separate security decision
  with their own gate (§195.6). See ADR [0017](../decisions/0017-server-visible-dms.md)
  (superseded by [0030](../decisions/0030-pre-alpha-consolidation-policy.md), which retired
  the plaintext mode this ADR governed; the federation prohibition itself is unchanged).
- **Federated communities need their own ADR** (§193, §195.2). The `Group`-actor pattern is
  real and standardized (FEP-1b12, final 2023-02-09), but how a microblog server renders a
  `Group` actor is **unverified** (re-confirmed 2026-08-22 — Mastodon's ActivityPub page
  still never mentions `Group`). Deferred by ADR 0028; Phase 18 schema assumes nothing
  about it.
- **A remote repost gets no exemption.** Inbound `Announce` must respect local block, mute
  and domain-block rules like any other activity (§193), and a quote of a remote post MUST
  NOT be displayed as authorized unless a FEP-044f authorization was actually received
  (`quote_policy`, §180.2) — which is why quote verification is a §109-gated remote fetch
  (ADR 0028 §5).
- **§180.1 chronology is local-only.** Our `Announce` emissions never re-sort anything on
  this node, but a receiving server orders its own timelines; say so plainly rather than
  pretending the rule federates (ADR 0028 §6).
- **Re-verify before implementing** (§0, §155). FEP-044f is a draft and Mastodon's quote
  support changed across two minor releases in four months; the table above is a starting
  point, not a specification.

### 7.6.1 Phase 18 schema (ADR 0028, P18-002)

Two schema objects landed with ADR 0028 (`FederationSocialDepthSchema` migration).
Both are now read and written by the inbox/outbox code described above (P18-003
through P18-007) — this is no longer schema-only.

- **`reposts.remote_activity_uri`** (nullable `text`, unique index) — the activity id of
  the **remote** `Announce` an inbound repost arrived as. A remote `Undo(Announce)` names
  that URI; storing it on the pointer row lets the undo find the row by lookup, and the
  unique index guarantees one remote activity id can never claim two local repost rows.
  Null on locally-originated reposts: outbound `Announce` ids are **reconstructed** from
  the row (ADR 0028 §4), never stored, so this column never carries a value this node
  minted.
- **`quote_authorizations`** — the FEP-044f authorization lifecycle, one row per
  (quoting post, quoted post) pair, mirroring the stamp's
  (`interactingObject`, `interactionTarget`) identity: `quoted_post_id`, `quoting_post_id`
  (nullable until the quote post has a local row), `quoter_actor_id`,
  `remote_stamp_uri` (the `quoteAuthorization` document URI, when one exists),
  `claimed_policy` (`ANYONE`/`FOLLOWERS`/`NOBODY`), `state`
  (`PENDING`/`VERIFIED`/`REVOKED`/`REJECTED`), `verified_at`/`revoked_at`, timestamps.
  Revocation is a state flip on the row, never a delete — an unauthorized-after-revocation
  quote is still rendered, just not as endorsed (§193). A CHECK constraint forbids
  self-quote rows (FEP-044f auto-approves those; no row needed). Indexes: unique
  (`quoting_post_id`, `quoted_post_id`) for exactly-one semantics; (`quoted_post_id`,
  `state`) for "who quoted me and is it still approved" and revocation fan-out.

> **Known doc gap, still open as of P18-010:** the two objects above belong in
> `docs/architecture/data-model.md` with the other tables; as of this writing that file
> still does not mention `reposts.remote_activity_uri` or `quote_authorizations`.
> `docs/architecture/data-model.md` is outside this task's owned paths — flagged here
> rather than fixed.

## 8. Domain stability warning (§21, §91)

Federated identities are URLs. Canonical actor/object URIs must use a **stable
production domain** — never a temporary `*.fly.dev` address baked permanently into
federated identity. The canonical domain must be chosen and fixed **before** public
federation is enabled (Stage F3), because changing it later breaks every remote
reference to local actors/posts.

Suggested domain separation once a real domain is chosen:

```text
patches.social              marketing/docs
api.patches.social          future HTTP API
grpc.patches.social         gRPC
social.patches.social       federation origin if desired
```

For local actors prior to federation, `canonical_uri` may be null or generated from
the currently configured origin — but that value is not load-bearing until
federation is actually turned on.

# Federation

**Status: F1 implemented (local lab only), off by default.** Phase 8 (P8-001..P8-008) built
the two-node lab described in §4's Stage F1: WebFinger, actor documents, inbox/outbox, `Follow`
/`Accept`/`Undo`/`Create`/`Delete`/`Like`, HTTP Signatures, SSRF/ingestion hardening, and a
two-real-process integration test (`apps/server/test/federation-two-node.integration.test.ts`).
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
- `Delete` (tombstone),
- `Like`/`Undo(Like)`.

Plus durable delivery: `FEDERATION_DELIVER` outbox jobs (`docs/architecture/jobs.md`) carry
deliveries with bounded retries (12 attempts, exponential backoff, then `DEAD`), and duplicate
delivery is safe both ways — `InboxActivity` dedupes by activity id on the receiving side, and
the `(activityId, inboxUrl)` pair is the outbox job's own idempotency key on the sending side.

Only reachable when `FEDERATION_ENABLED=true` (default off, §176) — that flag gates the entire
HTTP listener in `main.ts`, not just individual routes, so a node with federation disabled has
_zero_ new network surface, not a smaller one.

No Mastodon-compatibility goal yet — the objective is proving Patches-to-Patches federation
works end to end, verified by `apps/server/test/federation-two-node.integration.test.ts`
(two real child processes, real HTTP-Signature-signed loopback HTTP). Testing federation
assumptions here, four releases earlier than originally scheduled, is the entire point: a
wrong actor/URI/delivery assumption is cheap to fix now and expensive later.

Known F1-scope gaps, left for a follow-up rather than blocking the lab:

- the outbox (`GET /users/:handle/outbox`) returns the newest 20 public posts, not a true
  keyset-paginated `OrderedCollection` with paging;
- outbound delivery does not consult `domain_blocks` before enqueueing (inbound activities
  from a blocked domain _are_ rejected, both directions is the P8-006 target);
- `domain_blocks` has no write path yet (no RPC, no admin-CLI command) — rows must be
  inserted by hand today;
- `followers`/`following` AS2 collection endpoints are advertised on the actor document but
  not yet served (a remote peer fetching them gets a 404);
- avatar `icon` is never populated on the actor document (no public media URL resolver
  wired in yet).

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
- [x] outbox works _(local lab, P8-002 — newest-20 only, not true paging; see §4 Stage F1)_
- [x] `Follow` works _(local lab, P8-002)_
- [x] `Accept` works _(local lab, P8-002)_
- [x] `Create` works _(local lab, P8-002)_
- [x] `Delete` works _(local lab, P8-002)_
- [ ] `Update` semantics decided _(no `Update` activity handling yet)_
- [x] deliveries are durable _(P8-004, `FEDERATION_DELIVER` outbox jobs)_
- [x] duplicate delivery is safe _(P8-004/P8-006 — inbox dedupe + delivery idempotency key)_
- [x] retries are bounded _(P8-004 — 12 attempts, exponential backoff, then `DEAD`)_
- [x] signatures verified _(P8-005, draft-cavage-http-signatures-12)_
- [x] SSRF defenses exist _(P8-006, `safeFetch`/`isDisallowedIp`)_
- [x] remote response sizes bounded _(P8-006, `safeFetch` byte cap)_
- [x] remote request timeouts exist _(P8-006, `safeFetch` 10s timeout)_
- [ ] domain blocking exists _(partial: `domain_blocks` enforced on inbound in `InboxService`;
      no write path (RPC/admin-CLI) yet, and outbound delivery doesn't consult it — see §4)_
- [x] remote delete/tombstones work _(local lab, same as `Delete` above)_
- [ ] moderator can block remote server _(no RPC/CLI to write `domain_blocks` yet)_
- [ ] federation telemetry exists
- [x] two Patches servers interoperate _(P8-008, `federation-two-node.integration.test.ts`)_
- [ ] at least one mainstream Fediverse implementation interoperates _(F2 scope, not started)_

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

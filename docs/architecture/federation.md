# Federation

**Status: F0 only.** Patches runs as a single node today. This document describes the node
model, the architectural seam that keeps federation possible without coupling domain code to
ActivityPub, and the staged rollout that must be followed before any real network federation
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
depend directly on ActivityPub structures (§105):

```ts
interface FederationGateway {
  publishActor(...): Promise<void>;
  publishPost(...): Promise<void>;
  publishDelete(...): Promise<void>;
}
```

v0/current implementation:

```text
NoopFederationGateway
```

`FederationModule` exists in the module list (`overview.md` §3) purely as this
interface + stub today. No real network federation code runs yet.

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

### Stage F1 — two-node lab (**v0.1**, Phase 8)

Run two Patches nodes locally. **Local and non-public** — this is §108's Stage F1 verbatim,
moved earlier in the release sequence, not loosened. Implement:

- WebFinger,
- actor document serialization,
- inbox/outbox endpoints,
- `Follow`,
- `Accept`,
- `Create` (Note),
- `Delete`,
- basic `Like` if desired.

Plus durable delivery: the outbox/job machinery (`jobs.md`) carries deliveries with bounded
retries, and duplicate delivery must be safe.

No Mastodon-compatibility goal yet — the objective is proving Patches-to-Patches federation
works end to end. Testing federation assumptions here, four releases earlier than originally
scheduled, is the entire point: a wrong actor/URI/delivery assumption is cheap to fix now and
expensive later.

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

Federation is **not** publicly enabled until:

- [ ] stable canonical domain selected
- [ ] WebFinger works
- [ ] actors serialize correctly
- [ ] ActivityStreams objects validate
- [ ] inbox works
- [ ] outbox works
- [ ] `Follow` works
- [ ] `Accept` works
- [ ] `Create` works
- [ ] `Delete` works
- [ ] `Update` semantics decided
- [ ] deliveries are durable
- [ ] duplicate delivery is safe
- [ ] retries are bounded
- [ ] signatures verified
- [ ] SSRF defenses exist
- [ ] remote response sizes bounded
- [ ] remote request timeouts exist
- [ ] domain blocking exists
- [ ] remote delete/tombstones work
- [ ] moderator can block remote server
- [ ] federation telemetry exists
- [ ] two Patches servers interoperate
- [ ] at least one mainstream Fediverse implementation interoperates

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

## 7. Persistence mapping (§110)

Future remote entities are designed to fit the **existing** tables — federation does
not require a parallel schema.

Remote actor:

```text
actors.is_local = false
user_id = null
canonical_uri = remote actor URI
home_server = remote hostname
```

Remote post:

```text
posts.is_local = false
canonical_uri = remote object URI
origin_server = remote hostname
```

The original ActivityStreams JSON payload may later be stored in a bounded JSONB
column for interoperability/debugging, but raw ActivityStreams JSON is never the
application's primary domain model (§110).

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

# Federation

**Status: F0 only.** Patches is centralized today. This document describes the
architectural seam that keeps federation possible without coupling domain code to
ActivityPub, and the staged rollout plan that must be followed before any real
network federation is enabled. Source of truth: `INITIAL_VISION.md` §19, §21, §91,
§105–110, §160.

Guiding rule (§0, §161): **do not implement federation before the centralized
product works.** Federation is modeled correctly from day one so it can be earned
later, not bolted on.

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

### Stage F1 — two-instance lab

Run two Patches servers locally. Implement:

- WebFinger,
- actor document serialization,
- inbox/outbox endpoints,
- `Follow`,
- `Accept`,
- `Create` (Note),
- `Delete`,
- basic `Like` if desired.

No Mastodon-compatibility goal yet — the objective is proving Patches-to-Patches
federation works end to end.

### Stage F2 — interoperability

Test against mainstream ActivityPub implementations (e.g. Mastodon). Implement:

- discovery robustness,
- HTTP signing compatible with ecosystem expectations,
- remote actor caching,
- remote object ingestion,
- retry,
- deduplication,
- blocklist,
- domain moderation.

### Stage F3 — public federation

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

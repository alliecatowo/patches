# API versioning policy

Issue #203. Protobuf messages already live under package `patches.v1`, but until this document
there was no written policy for what `v1` guarantees, how a `v2` would ship, or how a client
finds out which version it's talking to. This is that policy — read alongside
[`api.md`](./api.md) (error model, RPC surface) and [`rollouts.md`](./rollouts.md) (per-feature
capability gates, a narrower and more frequent mechanism than a whole protocol version bump).

## What `patches.v1` guarantees

Every message and RPC under the `patches.v1` package is **additive-only** for as long as it is
`v1`:

- A field may be added to a message. It must get the next unused field number (never a reused
  one — see "Field number hygiene" below) and must be optional/have a zero-value default a
  pre-existing client can safely ignore.
- An RPC may be added to a service.
- An enum may gain a new value. Every enum already documents that clients must tolerate unknown
  values (see `NodeService.GetNodeInfoResponse.capabilities`'s doc for the pattern every
  `repeated string`/enum field in this codebase follows).
- A field, message, or RPC may **not** be removed, renamed, or have its number/semantics
  changed while still under `v1`. `buf breaking` (`pnpm proto:breaking`) is the enforcement
  mechanism — it runs against `main` on every PR that touches `packages/proto/proto/**` and is a
  required CI check, not a suggestion.
- "Breaking", precisely, is whatever `buf breaking`'s default ruleset (field number reuse, type
  changes, required-ness changes, removed RPC/service) flags. If a change buf doesn't flag is
  still semantically breaking (e.g. a field's _meaning_ changes without a wire-level signal),
  it needs a new field, not a mutation of the old one, and a note in that field's doc comment —
  `docs/research/connect-es.md`/`nestjs-grpc-protobuf.md` document this ts-proto/proto-loader
  boundary in more depth for anyone reaching for a "clever" reinterpretation instead.

**Field number hygiene** is the one hard rule that outlives every other paragraph here (spec
§153): a removed field's number is `reserved`, never reissued, forever — even across a `v2`
migration, since a `v1` client and a `v2` server (or vice versa, during the coexistence window
below) may still be decoding the same wire bytes against different schema copies.

## How a `v2` would be introduced

`v2` is a **new package** (`patches.v2`, a new proto directory `packages/proto/proto/patches/v2/`),
not an in-place mutation of `v1`. This is the same pattern `activitypub.md`/ADR 0013 already use
for versioning the federation surface, applied to the client-facing protocol:

1. A `v2` service is added alongside its `v1` counterpart — both compiled into the same
   `packages/proto` package and the same running server binary. `apps/server` registers both
   services on the same gRPC/Connect listener; a `v1`-only client keeps working with zero
   changes, because its RPCs never moved.
2. `v2` types are not required to be wire-compatible with `v1` — a `v2` message may drop a field
   `v1` carried, restructure nesting, whatever a real migration needs. The _coexistence_, not
   the wire shape, is what has to stay compatible.
3. Server-side application/service-layer code is shared where the underlying behavior hasn't
   changed (spec §128's layering: protobuf → controller → service → repository) — only the
   controller (transport-adapter) layer forks per version, mapping each package's messages onto
   the same service calls. A `v2` migration that also changes underlying behavior gets that
   change built once, then exposed differently at the transport edge per version, not
   duplicated business logic.
4. `v1` enters a **deprecation window** once `v2` covers its functionality: `GetNodeInfo`'s
   `software_version`/a future `deprecated_protocol_versions` advertisement (not yet built —
   filed as a follow-up, not implemented speculatively here) is how a node would announce "v1
   still works, but plan your migration." The window's length is an operational decision made
   when a `v2` is actually proposed (this is a pre-alpha single-operator project; there is no
   installed base yet to set a number against) — record it in that `v2`'s ADR, not here.
5. `v1` is removed only after the deprecation window closes **and** `buf breaking` is told to
   stop comparing against it (a `buf.yaml` config change, reviewed on its own PR) — removing a
   whole package is exactly the kind of change `buf breaking` exists to make deliberate, not
   accidental.

No `v2` exists yet. This section is the policy for when one is proposed, not an announcement
that one is coming.

## How a client discovers/negotiates the version

Two independent surfaces answer "what does this server speak", both unauthenticated (spec §83,
§163):

- **`SystemService.GetServerInfo`** (`packages/proto/proto/patches/v1/system.proto`) —
  `protocol_version` (a `uint32`, currently `1` — `packages/proto/src/constants.ts`'s
  `PROTOCOL_VERSION`) is "bumped only when the meaning of existing protobuf fields changes in a
  way `buf breaking` cannot catch" (the proto's own doc comment) — a narrower, rarer signal than
  a whole new `patches.vN` package; it exists for the class of change that isn't a new package
  but still isn't safely ignorable by an old client. `min_client_version` (semver) is the oldest
  client build this server still serves; a client older than that gets rejected outright.
- **Transport-level client version header**: every RPC carries `x-patches-client` and
  `x-patches-client-version` metadata (set once per `PatchesApi`/SDK instance —
  `apps/server/src/common/context/request-context.ts`'s `RequestContext` fields). The
  `RequestContextInterceptor` (`apps/server/src/common/interceptors/
request-context.interceptor.ts`) parses `x-patches-client-version` as semver and rejects a
  call whose version is older than `MIN_CLIENT_VERSION` with a client-version-gate error,
  **before** the RPC's own handler runs. A caller that sends no version at all (grpcurl, health
  probes, load balancers) is let through deliberately — the gate only fires on a version it can
  parse and compare.
- There is currently no negotiated _package_ version at the transport layer (no
  `x-patches-api-version` header) because only `patches.v1` exists — a gRPC/Connect method call
  is already addressed to a fully-qualified service (`patches.v1.NodeService/GetNodeInfo`), so
  the package name in that address _is_ the version selector once `v2` exists side-by-side.
  Introducing an explicit header is unnecessary until a client needs to ask "which versions does
  this server support" before picking an address — if that need arises, the natural place is a
  new `GetServerInfoResponse` field (`repeated string supported_api_packages`, e.g.
  `["patches.v1", "patches.v2"]`), not a new header, so it stays inside the existing
  unauthenticated discovery RPC rather than a bespoke third mechanism. Not implemented
  speculatively here since no second package exists to advertise yet.

A client's own connection sequence should always be: call `GetServerInfo` first (this is
already every client's practice — `apps/tui/src/hooks/useServerInfo.ts`, `apps/web`'s app
bootstrap), reject/warn if `protocol_version`/`software_version` looks incompatible, then proceed
to any `patches.vN` service calls.

## Relationship to rollout capability gates

A protocol/package version answers "does this server and this client understand the same wire
shapes at all" — a one-time, coarse-grained compatibility check at connection time. A capability
flag (`NodeService.GetNodeInfoResponse.capabilities`/`social_capabilities`) or a feature flag
(`feature_flags`, issue #142) answers "is this specific, already wire-compatible behavior turned
on for this node" — checked per-feature, not per-connection. See
[`rollouts.md`](./rollouts.md) for that narrower mechanism and its own reversibility policy;
don't reach for a protocol version bump to gate a feature that a capability/feature flag would
cover.

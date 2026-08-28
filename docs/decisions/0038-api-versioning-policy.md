# 0038. API versioning policy: `patches.v1` is additive-only, a `v2` is a sibling package

**Status:** Accepted
**Date:** 2026-08-28

## Context

Every protobuf message and RPC has lived under the `patches.v1` package since ADR 0002, but
nothing was written down about what that `v1` actually promises. Issue #203 named the gap: no
policy for what `v1` guarantees, how a `v2` would ship, how a client discovers which version it
is talking to, or what "breaking" means in a repo where `pnpm proto:breaking` is a required CI
check. Absent a written answer, the cheap-feeling move when `v1` gets awkward is to mutate a
message in place and argue the change is "not really breaking" — which is precisely the argument
a version number exists to end.

Two discovery mechanisms already exist and are load-bearing: the unauthenticated
`SystemService.GetServerInfo` (`protocol_version`, currently `1`, and `min_client_version`, both
sourced from `packages/proto/src/constants.ts`) and the `x-patches-client-version` transport
header enforced by `RequestContextInterceptor` before any handler runs. The risk was inventing a
third mechanism alongside them rather than noticing they already answer the question.

No `v2` is proposed. This is policy written before it is needed, so the first `v2` proposal
argues about its own merits and not about the rules.

## Decision

1. **`patches.v1` is additive-only for as long as it is `v1`.** Fields, RPCs, and enum values may
   be added; nothing may be removed, renamed, renumbered, or have its semantics changed.
2. **"Breaking" means whatever `buf breaking` flags** under its default ruleset, run against
   `main` on every PR touching `packages/proto/proto/**`. A change buf cannot see but that alters
   a field's _meaning_ requires a new field, not a reinterpretation of the old one.
3. **A removed field number is `reserved` forever and never reissued** (spec §153) — including
   across a `v2`, since mixed-version clients and servers may decode the same bytes against
   different schema copies. This ADR reaffirms an existing hard rule; it does not soften it.
4. **A `v2` is a new sibling package** (`patches.v2`, its own proto directory) served by the same
   binary on the same listener alongside `v1`, not an in-place rewrite of `v1`. Only the
   controller/transport-adapter layer forks per version; application services and repositories
   stay shared (§128). `v1` is removed only after an explicit deprecation window, whose length is
   set in that `v2`'s own ADR.
5. **Version discovery uses the mechanisms that already exist** — `GetServerInfo`'s
   `protocol_version`/`min_client_version` plus the `x-patches-client-version` header — not a new
   one. A fully-qualified method name already carries its package, so the address _is_ the
   version selector once a second package exists. If a client ever needs to enumerate supported
   packages before choosing, that becomes a field on `GetServerInfoResponse`, not a new header.

Full detail — the per-rule mechanics, the coexistence sequence, the interceptor's behavior on an
absent version header, and how all of this relates to capability/feature gates — lives in
[`docs/architecture/api-versioning.md`](../architecture/api-versioning.md). That document is the
reference; this ADR is only the decision and why.

## Consequences

- The awkward-schema escape hatch is closed by default: a change that does not fit additively is
  now visibly a `v2`-sized proposal requiring its own ADR, rather than a judgement call in a
  single PR review. That is the intended friction.
- `v1` accretes deprecated-but-present fields over time, since nothing can be deleted. Accepted:
  wire bloat is cheap relative to silently breaking an installed client.
- Two packages served at once means a `v2` migration costs a duplicated controller layer for the
  length of the deprecation window. Bounded, and the shared service layer keeps behavior from
  forking with it.
- Clients keep a single connection-time compatibility check that already works, and gain no new
  handshake to implement or get wrong.
- `GetServerInfo` becomes more load-bearing than its size suggests; it must stay unauthenticated
  and cheap (§83, §163).
- Deliberately not built now: a `supported_api_packages` field and a
  `deprecated_protocol_versions` advertisement. Both are named in the policy as the shape to
  reach for, neither is implemented speculatively with no second package to advertise.

## Alternatives considered

- **Mutate `v1` in place with a `protocol_version` bump.** Rejected: it makes every existing
  client's correctness depend on a number it may not check, replaces a compiler-and-CI-enforced
  guarantee with a convention, and requires suppressing `buf breaking` — turning the one
  mechanical check that catches this class of error into noise to be silenced.
- **A `v2` as a separate service/deployment.** Rejected: doubles the operational surface for a
  single-operator pre-alpha node, and forces state coordination between two binaries when the
  only thing that actually differs is the transport-edge mapping.
- **A dedicated `x-patches-api-version` negotiation header.** Rejected as redundant — gRPC and
  Connect already address a fully-qualified `patches.vN.Service/Method`, so the header would
  duplicate the routing information in every request and add a way for the two to disagree.
- **No policy; decide when a `v2` is actually needed.** Rejected: that decision would then be made
  under schedule pressure by whoever hit the wall, which is the situation most likely to produce
  the in-place mutation this ADR forbids.

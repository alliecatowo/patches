# Rollout discipline: reversible capability gates

**Status: implemented as policy for new work; not retrofitted onto every existing RPC.** Issue
#202. Every new user-facing or server behavior ships behind an explicit, reversible gate — this
document names the three gate mechanisms already in the codebase, when to use which, and how to
roll one back. See [`api-versioning.md`](./api-versioning.md) for the coarser, connection-time
version story this is a narrower complement to, and [ADR 0014](../decisions/0014-capabilities-not-tiers.md)
for why gates are capabilities, never tiers.

## The rule

> Every new user-facing/server behavior ships behind a version/capability gate: a capability RPC
> field, a node-policy flag, or a client feature flag. It must be possible to turn the behavior
> back off without a data migration or a client release.

This is not optional for anything that changes what a client renders or what the server accepts.
It does not apply to a pure bugfix that restores previously-intended behavior, or to an internal
refactor with no observable change at either API boundary.

## The three gate mechanisms

| Mechanism            | Where                                                                                                        | Granularity                                                                        | Example already shipped                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Capability RPC field | `NodeService.GetNodeInfoResponse.capabilities` (bare on/off) or `.social_capabilities` (value-carrying)      | Per-node, read at connection time                                                  | `dm_enabled`, `can_create_community`, `like_glyph_allow_list` (§190) |
| Node-policy flag     | `AppConfigService` env var, not published verbatim over the wire — the server branches on it directly        | Per-node, read at request time (can differ mid-process-lifetime only via redeploy) | `FEDERATION_ENABLED`, `PASSWORD_AUTH`, `PUBLIC_READ`                 |
| Client feature flag  | `NodeService.GetNodeInfoResponse.feature_flags` (issue #142, `@patches/domain`'s `FEATURE_FLAG_DEFINITIONS`) | Per-node, TTL-cached client-side                                                   | none declared yet — the mechanism exists, nothing has needed it      |

All three are **read by the client, not decided by it** — a node's operator controls the gate; a
client never has a local override that disagrees with what the node just told it (the one
partial exception, `useTheme`'s local light/dark preference, is a pure rendering choice with no
server-visible behavior behind it).

### Choosing one

- **Capability RPC field** — the behavior is a genuine per-node policy choice with a value an
  operator sets once and a client checks before offering the feature at all (can this node's
  users create communities; what glyphs may a custom reaction use). Changing a `SocialCapabilities`
  field is a config change plus a restart, same as any other `AppConfigService` value.
- **Node-policy flag** — the behavior only exists server-side; nothing needs to be published
  because there is no client-side branch to make (federation's HTTP surface, whether password
  auth is accepted at all). Prefer this over inventing a capability field when a client has
  nothing useful to render differently.
- **Client feature flag** (issue #142) — a **rollout** (staging a functionally-complete feature
  across client versions before every build supports it) or a **cosmetic** (a skin/theme/
  decoration difference). Never a function fork — see the hard rule below. Use this instead of a
  capability field when the flag is expected to be short-lived (removed once the rollout
  completes) rather than a standing per-node policy.

### Hard rule this document exists to restate (§184.3)

**Cosmetics may be capability-gated. Capabilities never gate function.** A gate of any of the
three kinds above may turn a decoration on or off, or stage the rollout of an already-complete
feature — it may never be the only way to reach functionality otherwise unavailable (no paywalled
function, ever). `@patches/domain`'s `FeatureFlagDefinition.kind` (`'cosmetic' | 'rollout'`)
encodes this in the type system for client feature flags specifically; `packages/domain/src/
feature-flags.test.ts` asserts every declared flag has a valid `kind`. The equivalent check for a
capability RPC field or a node-policy flag is a code-review judgment call, not a compiler check —
this document is what a reviewer points to.

## How to roll one back

Every gate above is reversible by construction — that's the property this document requires, not
an afterthought:

- **Capability RPC field**: flip the env var (`CAN_CREATE_COMMUNITY=false`, an empty
  `LIKE_GLYPH_ALLOW_LIST`, etc.) and restart. The next `GetNodeInfo` call reflects the change;
  every client that reads capabilities before acting (rather than caching a stale "yes" forever)
  degrades cleanly. No data migration — a capability gates _offering_ the behavior, never what
  already-created data means.
- **Node-policy flag**: same — flip the env var, restart. `FEDERATION_ENABLED=false` after having
  been `true` does not delete anything federation created; it stops new federation activity
  (see `federation.md`'s own rollback note under Stage F1).
- **Client feature flag**: set `FEATURE_FLAGS=<name>=false` (or drop the override to fall back to
  `FeatureFlagDefinition.defaultEnabled`) and restart. Every client re-reads the flag list within
  its TTL cache window (5 minutes, both `apps/web/src/hooks/useFeatureFlags.ts` and
  `apps/tui/src/api/featureFlagsCache.ts`) with no client release required — this is the entire
  point of a client-side flag over a client-version-gated behavior.

None of the three mechanisms requires a schema rollback, because none of them changes what's
stored — they only change what a client is told is currently available. If a rollout ever needs
to also change stored data shape, that's a separate, explicitly-reversible migration
(`docs/operations/database.md`), not something a flag alone can undo.

## Rollout log

Every flag/capability introduced under this policy gets one row here — the mechanism, what it
gates, and its current status, so an operator or future implementer can find "what is this and
can I turn it off" in one place instead of grepping env var names across the codebase.

| Name         | Mechanism | Kind | Status | Rollback |
| ------------ | --------- | ---- | ------ | -------- |
| _(none yet)_ | —         | —    | —      | —        |

`@patches/domain`'s `FEATURE_FLAG_DEFINITIONS` is empty in v0 (no rollout is in flight); this
table gains a row the first time a real entry is added there, or a new capability/node-policy
flag ships under this policy.

## Not yet built

A CI-side check that fails a PR introducing a new RPC/field without a matching capability/flag
entry does not exist yet (tracked as a follow-up on issue #202) — this document is the written
policy; automated enforcement of it is separate future work, most likely a small script under
`infra/` or a vitest in `packages/proto` that diffs the proto surface against this log.

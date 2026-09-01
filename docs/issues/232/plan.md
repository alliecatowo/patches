# Issue #232 — Contract fuzzing spike

## Goal

Decide whether EvoMaster can be introduced as an off-the-shelf contract fuzzer
against disposable harness labs without creating a hand-rolled fuzzing engine.

## Decision

The current spike is a no-go for integration. The checked-in grpc-java output
is transport input only: this tree has no runnable EvoMaster RPC driver, Maven
project, pinned EvoMaster client dependency, or fuzz command. A driver has not
been validated as a thin wrapper; adding one now would be new framework-specific
integration work rather than evidence that the go criterion was met.

The existing protobuf/transport fuzz path remains retained. The fallback is the
declarative Vitest auth-guard/negative matrix, with the Pact protobuf plugin as
an optional future contract-matching complement. No local mutator or oracle is
added.

## Safety requirements retained for any future retry

- local loopback harness targets only, never production or an unknown preview;
- explicit safe-operation allowlist and default-deny mutation/destructive calls;
- unique per-run fixture namespace;
- redacted artifacts with no tokens or message bodies; and
- cleanup proven through the harness lifecycle before a run is successful.

# Issue #232 — Contract fuzzing spike

## Goal

Decide whether EvoMaster can be introduced as an off-the-shelf contract fuzzer
against disposable harness labs without creating a hand-rolled fuzzing engine.

## Plan

1. Inspect the existing Buf Java generation profile and harness isolation/redaction APIs.
2. Reproduce generation and runtime prerequisites locally.
3. Apply the thin-wrapper go/no-go bar: generated stubs may be checked in, but
   mutation, search, and oracle logic must remain in EvoMaster.
4. Record the decision, safety boundary, and fallback in the issue workpad and
   handoff artifacts.

## Decision gate

The spike is a no-go for integration in this repository at present. EvoMaster's
RPC mode requires a JVM driver exposing an RPC client interface and implementation;
the current tree contains only generated grpc-java messages/stubs and no driver
or pinned EvoMaster dependency. Adding the required driver would be a new
framework-specific integration layer, not a validated thin transport wrapper.

The existing protobuf/transport fuzz path remains retained. The fallback is the
declarative Vitest auth-guard/negative matrix, with the Pact protobuf plugin as an
optional future contract-matching complement. No local mutator or oracle is added.

## Safety requirements retained for any future retry

- local loopback harness targets only, never production or an unknown preview;
- explicit safe-operation allowlist and default-deny mutation/destructive calls;
- unique per-run fixture namespace;
- redacted artifacts with no tokens or message bodies;
- cleanup proven through the harness lifecycle before a run is considered successful.


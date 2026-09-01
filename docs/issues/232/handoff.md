# Issue #232 handoff

## Result

The EvoMaster spike is a documented no-go in the current tree. Its grpc-java
generation slice exists, but no runnable EvoMaster RPC driver, Maven project,
pinned client dependency, or fuzz command exists to demonstrate the required
thin wrapper. No hand-rolled fuzz engine was introduced.

The retained fallback is the declarative Vitest auth-guard/negative matrix;
the Pact protobuf plugin remains an optional future contract-matching complement.

## Evidence

- `infra/fuzz/buf.gen.yaml` pins `protoc-gen-java` v30.2 and
  `protoc-gen-grpc-java` v1.71.0 and emits checked-in grpc-java stubs.
- The generated output contains messages and transport stubs, not an EvoMaster
  driver, search, mutator, or oracle.
- Runtime regeneration is unavailable in this managed workspace because mise
  cannot trust the configuration or write its trust symlink. No tests are
  represented as green.

## Validation

- `git -c core.fsmonitor=false diff --check` passed before the retry migration.
- Retry static diff and artifact-path validation passed after this change.

## Delivery boundary

The issue remains In Progress. The workspace changes are intentionally left
uncommitted and unpublished for the delivery harness.

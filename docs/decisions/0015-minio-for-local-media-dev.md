# 0015. MinIO for local media dev, Cloudflare R2 in production

**Status:** Accepted
**Date:** 2026-08-18

## Context

ADR 0005 chose Cloudflare R2 (S3-compatible) as the production object store. B-001 asks
which store backs local development, since spec §96 permits either a real R2 bucket or a
local S3-compatible stand-in. A real R2 bucket for every developer/CI run would mean
sharing (or provisioning per-agent) Cloudflare credentials and network access, and would
make integration tests dependent on an external service being reachable and empty between
runs.

## Decision

Use **MinIO** as the local-dev and integration-test object store, run via
`infra/compose/docker-compose.yml` (`minio` + a one-shot `minio-init` bucket-creation
container, both default-on — `mise run compose -- up -d` brings up Postgres, mail, and
MinIO together, no profile flag needed). `packages/media`'s `S3StorageClient` is the single
implementation for both: it talks to whatever S3-compatible endpoint `R2_ENDPOINT` points
at, with `R2_FORCE_PATH_STYLE` (default `true`) making that endpoint-agnostic between
MinIO's path-style requirement and R2's virtual-hosted-style default (R2 also accepts
path-style, so one flag covers both without branching on which backend it is). The bucket
stays **private** in both environments — no public-read policy — matching
`docs/architecture/media.md` §6: the API always issues short-lived presigned GET URLs after
authorization, never a public bucket URL.

## Consequences

- Local dev and CI integration tests run entirely offline, with no shared external
  credentials and a bucket that resets with `mise run compose -- down -v` like every other
  local dependency.
- Exactly one `StorageClient` implementation to maintain and test; MinIO and R2 diverge only
  in which environment variables point at them (`R2_ENDPOINT`, `R2_ACCOUNT_ID` unset for
  MinIO).
- `MediaService`'s integration tests must be able to skip cleanly when no local MinIO is
  reachable (e.g. a sandboxed CI job with compose unavailable), the same pattern the rest of
  the server's Postgres-backed integration tests already use for `TEST_DATABASE_URL`.
- Path-style addressing is not R2's documented default, so any code path that assumes
  virtual-hosted-style URLs (e.g. constructing a public URL by hand instead of through the
  `StorageClient`) would break against R2 even though it works against MinIO — the storage
  client is the only place object URLs may be constructed, precisely to avoid that trap.

## Alternatives considered

- **A real R2 bucket, shared across dev/CI.** Rejected: leaks production-adjacent
  credentials into every developer's and CI runner's environment, and a shared bucket
  between concurrent test runs (this repo's swarm-of-agents workflow, `docs/agents/`) would
  need namespacing/cleanup discipline that a disposable local MinIO gets for free by simply
  not persisting between `compose down -v` runs.
- **LocalStack.** Rejected as unnecessary: LocalStack emulates the full AWS surface, but
  Patches only needs S3-compatible object storage — MinIO is a lighter, purpose-built
  container for exactly that, and is itself a real S3-compatible object store (not an
  emulator), so behavior differences from R2 are limited to the two the code already has to
  handle (path-style addressing, region handling) rather than emulation gaps.
- **Skip local storage entirely; mock `StorageClient` in every test.** Rejected as the sole
  strategy: unit tests do mock the SDK (`packages/media`'s test suite), but `BeginMediaUpload`
  → `FinalizeMediaUpload` → worker processing → `GetMediaDownload` is exactly the kind of
  multi-step flow spec §154 wants exercised against something real, not just mocks that could
  drift from the actual S3 API's behavior.

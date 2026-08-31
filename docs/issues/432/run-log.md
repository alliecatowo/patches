# Issue #432 run log

- 2026-08-30: Confirmed no `ChangePassword` symbol existed in proto, server, TUI, or web.
- 2026-08-30: GitHub issue moved Todo → In Progress and workpad comment created.
- 2026-08-30: `git fetch/rebase` could not run because `.git/FETCH_HEAD` is read-only.
- 2026-08-30: `pnpm proto:gen` could not run because the managed pnpm store is read-only and
  dependencies are unavailable; direct `buf generate` also lacks local protoc plugins.
- Retry #1: inspected persisted commit `ee7e079` and confirmed the prior failure is consistent
  with protobuf-es generated freshness/runtime output not being regenerated.
- Retry #1: attempted isolated pnpm install with `/tmp/patches-pnpm-store`; package downloads
  failed with `EAI_AGAIN` because registry network access is unavailable.
- Retry #1: `buf lint`, `buf format -d --exit-code`, and `git diff --check` pass. Typecheck cannot
  run because the recovered dependency wrappers are incomplete.
- Retry #1: attempted cached-layer Prettier/typecheck recovery; wrappers resolve through the
  protected mise installation and still cannot execute. No source files changed during retry.
- Retry #3: reproduced generated-code freshness defects: the checked-in protobuf-es descriptor
  omitted `ChangePassword`, and every following `messageDesc` index still referenced the old
  schema order.
- Retry #3: regenerated ts-proto output with the cached generator and rebuilt the protobuf-es
  compact descriptor from Buf output. The compacting procedure was verified byte-for-byte
  against the previously generated descriptor before applying the new schema.
- Retry #3: corrected all protobuf-es message indexes after the two new messages and added the
  generator-emitted RPC documentation to both generated families.
- Retry #3: reproduced and fixed Prettier failures in `auth.controller.ts`,
  `CredentialsRoute.tsx`, and `docs/architecture/api.md`.
- Retry #3 validation passed: direct Buf format, Buf lint, Buf breaking against `main`, generated
  ts-proto comparison (exact except the cached generator's version header), changed-file
  Prettier check, and `git diff --check`.
- Retry #3 validation limitation: `mise run check proto` reaches the pinned Node but the managed
  sandbox rejects its workspace-resolution subprocess with `spawnSync /bin/sh EPERM`; pnpm also
  cannot repair dependencies because its home store is read-only and registry access is absent.
- Retry #14: inspected the latest `build-test` check annotation for commit `07723d7`; CI failed
  only because `packages/proto/src/proto-loading.test.ts` still expected the pre-change AuthService
  RPC list and reported `ChangePassword` as an unexpected method.
- Retry #14: added `ChangePassword` to that sorted contract expectation. The exact failing test
  passed (9/9), the complete proto unit-test suite passed (3 files, 39/39), and the changed test
  passed Prettier.
- Retry #14: temporarily reconstructed cached dependencies solely to run the tests, then removed
  the reconstructed dependency/build state and restored the workspace's original `node_modules`.

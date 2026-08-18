---
paths:
  - 'packages/proto/**'
---

# Proto rules

Full change procedure: `/proto-change`. This file is the standing conventions; the skill is the workflow.

- **proto3**, package `patches.v1`. File naming mirrors the service/resource it defines.
- **`buf lint` / `buf breaking` are the gate** — run before every commit that touches a `.proto` (`pnpm proto:lint`, `pnpm proto:breaking`). Never suppress a buf lint rule without a one-line documented reason.
- **Field number hygiene**: never reuse a removed field number or name — `reserved` it. This is a hard rule (spec §153), not a style preference.
- **Message naming**: `XxxRequest` / `XxxResponse` per RPC; don't share a message across unrelated RPCs just to save a definition.
- **Pagination**: the shared `PageInfo` keyset pattern (spec §46) — never an offset/page-number field.
- **Error model**: gRPC status codes per the documented mapping (spec §57) — don't invent new status semantics per-service; point to `docs/architecture/api.md`'s error model section.
- **Generated code is committed** — `pnpm proto:gen` output under `packages/proto` is checked in, not gitignored. Regenerate and commit in the same change as the `.proto` edit.
- **`packages/proto` never imports server implementation code** (spec §129) — it's a pure schema+generated-client package, consumable by both `apps/server` and `apps/tui`.

## Generation contract

- ts-proto is generated with `useDate=false,forceLong=string` because `@grpc/proto-loader` (the runtime serializer, `longs: String`) never produces `Date`; convert with the `dateToTimestamp`/`timestampToDate` helpers in `@patches/proto`. Don't flip `useDate` without changing the loader.
- `pnpm proto:breaking` wraps `scripts/breaking.sh` (handles cwd-relative `.git#` refs and empty base branches). Don't call `buf breaking` by hand from the package dir.

---
name: ts-proto-repeated-field-non-optional
description: adding a new `repeated` field to an existing proto request message is wire-additive but breaks every existing TS caller's object-literal typecheck across the whole monorepo
metadata:
  type: feedback
---

ts-proto emits `repeated` fields as plain non-optional arrays in the generated TS interface
(no `?`), never as an optional property with an implicit `[]` default. Adding a new `repeated`
field to an existing request/response message — even though it's wire-additive and proto-lint/
buf-breaking both pass clean — makes every existing object-literal call site across every
consuming package (server tests, TUI, worker, admin) fail `tsc` with "Property 'x' is missing".

**Why:** discovered adding `repeated FilterScope scopes` to `SubscribeFilterListRequest`
(P14-022) — `pnpm --filter @patches/server typecheck`, `pnpm --filter @patches/proto build`
all stayed green, but `apps/tui`'s existing `subscribeFilterList({ filterListId, action })` call
sites (and their test fixtures) broke, because ts-proto's `SubscribeFilterListRequest.scopes:
FilterScope[]` has no `?`. protobuf-es (`@patches/proto/es`, used by the web client via
Connect-es) does NOT have this problem — its generated `PartialMessage`/call-init types make
every field optional, so `apps/web`'s equivalent call site typechecked with zero changes. See
[[protobuf-es-numeric-enums-vs-ts-proto-string-enums]] for the other ts-proto/protobuf-es
divergence already on file.

**How to apply:** after any `.proto` change that adds a `repeated` (or any non-`optional`)
field to a message already consumed as a request/response type, grep every workspace for
existing object-literal call sites of that RPC/message (`grep -rln "<methodName>" apps/`) and
add the new field explicitly (empty array/default value) before declaring the proto change done
— `pnpm --filter @patches/proto build` passing is not sufficient signal; each consuming
package's own `typecheck` has to run too. `apps/web`'s Connect-es/protobuf-es call sites are the
one place this doesn't apply.

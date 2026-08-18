---
name: proto-stringEnums-runtime-mismatch
description: buf.gen.yaml's ts-proto stringEnums must be true, not the ts-proto default false, because @grpc/proto-loader always decodes enum fields to their string name
metadata:
  type: feedback
---

In `packages/proto`, `@grpc/proto-loader` (not ts-proto) is the actual runtime
(de)serializer — `nestJs=true` generation emits no `encode`/`decode`. `PROTO_LOADER_OPTIONS`
sets `enums: String`. Verified empirically (encode a message via `Service.serialize`, decode
via `Service.deserialize`): proto-loader accepts either the numeric or the string form on
encode, but **always** decodes an enum field to its string name (e.g.
`"POST_TYPE_NOTE"`), including for an unset/default field (decodes to the zero-value's
string name, e.g. `"POST_TYPE_UNSPECIFIED"`).

**Why this matters:** `buf.gen.yaml`'s ts-proto `opt` list originally had no `stringEnums`
entry, so it used ts-proto's default (`stringEnums=false`) — a numeric TS enum
(`PostType.POST_TYPE_NOTE = 1`). That type-checks fine but is never what's actually on the
object at runtime (`"POST_TYPE_NOTE"` !== `1`) — a silent landmine that wouldn't have
surfaced until someone wrote `if (post.postType === PostType.POST_TYPE_NOTE)` and watched it
always evaluate false. No enum field existed in the schema before this was caught, so the
bug had never been exercised.

**How to apply:** `packages/proto/buf.gen.yaml` now sets `stringEnums=true` explicitly with a
comment explaining why. Any future proto-related config change in this package should be
checked the same way I found this: don't trust generator defaults or a stale research note
against a _different_ runtime serializer — write a throwaway `.proto` message with the
feature in question, `buf generate`, then load it with the _actual_ runtime path
(`@grpc/proto-loader` here) and inspect the real value, not just the generated TS type. See
also `docs/research/nestjs-grpc-protobuf.md` and [[proto-nestjs-value-export-leak]].

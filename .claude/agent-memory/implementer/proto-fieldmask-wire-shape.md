---
name: proto-fieldmask-wire-shape
description: "@grpc/proto-loader decodes/encodes google.protobuf.FieldMask as { paths: string[] }, not the flat string[] ts-proto's generated type claims"
metadata:
  type: feedback
---

Same class of bug as `[[proto-stringEnums-runtime-mismatch]]`: `@grpc/proto-loader` is the
actual runtime (de)serializer in `apps/server` (see `PROTO_LOADER_OPTIONS` in
`packages/proto/src/constants.ts`), not ts-proto's generated `encode`/`decode` (which don't
even exist — `nestJs=true` emits none). ts-proto's `nestJs=true` generator flattens a
`google.protobuf.FieldMask` field to `updateMask: string[] | undefined` on the generated
request type, matching its _own_ runtime convention — but `@grpc/proto-loader` has no such
special-casing and (de)serializes it as the message's literal wire shape,
`{ paths: string[] }`.

**Why this matters:** Found implementing `ActorService.UpdateProfile` (P2-002). Sending
`updateMask: ['bio']` from a raw grpc-js client (matching the generated TS type) round-tripped
through the real server as `{ paths: [] }` — proto-loader's encoder read `value.paths` off the
array (`undefined`) and produced an empty list, so every `UpdateProfile` call silently updated
nothing. The controller-side crash (`new Set(request.updateMask)` throwing "not iterable")
only showed up because the decode side got the object form.

**How to apply:** Any `.proto` message with a `google.protobuf.FieldMask` field needs two
things in `apps/server`: (1) the controller must unwrap `{ paths }` defensively (see
`apps/server/src/modules/actors/actor.controller.ts`'s `fieldMaskPaths` helper — it accepts
either shape); (2) any raw grpc-js client constructing the request (tests, or a future
non-generated caller) must send `{ paths: [...] }` cast to the generated type, not a flat
array (see `apps/server/test/actors.integration.test.ts`'s `fieldMask()` helper). Verify any
new well-known-type usage the same way: build a throwaway request, send it through the real
`@grpc/proto-loader` path, and log what the controller actually receives — don't trust
ts-proto's generated TS shape.

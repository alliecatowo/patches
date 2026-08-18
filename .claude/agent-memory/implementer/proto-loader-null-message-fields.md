---
name: proto-loader-null-message-fields
description: "@grpc/proto-loader decodes an unset message-typed field as null, not undefined — ts-proto's generated type only claims undefined"
metadata:
  type: feedback
---

Related to `[[proto-fieldmask-wire-shape]]`/`proto-stringEnums-runtime-mismatch` (same root
cause: ts-proto's `nestJs=true` generated TS types describe ts-proto's own runtime convention,
but `@grpc/proto-loader` is the actual (de)serializer in `apps/server` and doesn't follow it).

**Why this matters:** Found implementing `ActorService.UpdateProfile`'s new `nameplate`
field (P3-001, a nested message field, not a scalar). The generated type is
`nameplate?: Nameplate | undefined`, so `request.nameplate === undefined` looks like the
correct "field not sent" check — but proto-loader decodes an unset embedded-message field as
`null` on the wire, not `undefined`. The `=== undefined` check let a `null` value through to
`request.nameplate.nameColor`, crashing with `TypeError: Cannot read properties of null` —
and because the integration test's Nest logger was `logger: false`, this surfaced only as an
opaque `13 INTERNAL` gRPC error with no visible stack trace until the logger was temporarily
flipped to `['error', 'warn']` in `test/support/test-server.ts` to see it.

**How to apply:** Any optional nested-message field read off a proto-loader-decoded request
in `apps/server` must check `value === undefined || value === null`, not just `=== undefined`
— see `apps/server/src/modules/actors/actor.controller.ts`'s `updateProfile` nameplate guard.
When a test gets an opaque `INTERNAL` error with no useful message, temporarily set
`logger: ['error', 'warn']` (not `false`) in `startTestServer` to see the real server-side
stack trace, then revert it before committing.

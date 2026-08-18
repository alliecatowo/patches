---
name: proto-nest-index-hand-maintained-reexports
description: "packages/proto/src/{index.ts,nest.ts,constants.ts} are hand-curated explicit re-export lists, not auto-generated — a new proto message/RPC must be added to them by hand or it's unimportable even after pnpm proto:gen"
metadata:
  type: feedback
---

`pnpm proto:gen` (buf generate) only regenerates `packages/proto/src/generated/**`. The
package's actual public surface — `packages/proto/src/index.ts` (ESM-safe, TUI-importable),
`src/nest.ts` (Nest-flavoured, server-only, pulls in `@nestjs/microservices`), and
`src/constants.ts` (raw grpc-js client interfaces like `AuthGrpcClient`) — are hand-written
files with explicit named re-export lists, on purpose (see `nest.ts`'s own doc comment: a
blanket `export *` would collide on each generated file's repeated `protobufPackage` const).

**Why this matters:** Added a new RPC (`BeginSshEnrollment`) and message
(`SshEnrollmentProof`) to `auth.proto`, ran `proto:gen` successfully, but `apps/server` and
`apps/tui` both failed to import the new types (`TS2305: has no exported member`). The types
existed in `generated/patches/v1/auth.ts` and even in the tsup dist chunk file, but weren't
re-exported from the package's public entry points because those lists are maintained by
hand.

**How to apply:** After any `.proto` change that adds a message/RPC a client needs to import
by name, check whether it needs adding to `index.ts` (TUI + shared types), `nest.ts` (server
controller/client types, decorators), and `constants.ts` (if a raw `*GrpcClient` interface —
used by integration tests via `createXClient` — needs the new method). Also check
`src/proto-loading.test.ts`'s RPC-surface assertions, which enumerate every RPC name per
service and will fail (correctly) until the new RPC is added there too. See related
[[proto-fieldmask-wire-shape]] and [[proto-stringEnums-runtime-mismatch]] — same family of
"the generated-code layer doesn't automatically become the package's public contract."

# 0002. gRPC + Protobuf as the client/server protocol

**Status:** Accepted
**Date:** 2026-08-17

## Context

Patches' primary client is a TUI (Ink/React), with React Native planned as a future second
client. The API needs a schema that is strongly typed end to end, versionable without
breaking existing clients, and efficient enough for a chatty terminal UI issuing frequent
small requests (feed pagination, thread expansion, live-ish notification checks). It also
needs a canonical contract that isn't tied to any one client's ergonomics.

## Decision

Use **Protocol Buffers (proto3)** as the canonical API schema, organized under
`packages/proto/proto/patches/v1/` with one `.proto` file per domain area (`auth`, `users`,
`actors`, `posts`, `feeds`, `media`, `moderation`, `notifications`, `common`), package
namespace `patches.v1`. Use the **Buf CLI** for formatting, linting, breaking-change
detection, and code generation (`buf format`, `buf lint`, `buf breaking`, `buf generate`).
CI rejects breaking protobuf changes against `main` unless intentionally introducing a new
API version; removed field numbers/names are reserved, never reused.

Use **gRPC** (`@grpc/grpc-js`, not the deprecated native `grpc` package) as the primary
TUI/backend transport, using NestJS's built-in gRPC microservice support
(`@grpc/proto-loader`). Generate TypeScript types from the `.proto` files with `ts-proto`
for compile-time type safety, while Nest loads the `.proto` definitions directly through its
supported gRPC transport mechanism — the two are not made to fight each other. Generated
code is clearly marked as generated and never hand-edited.

## Consequences

- One schema drives client and server types, eliminating a whole class of "the API changed
  and nobody told the client" bugs.
- `buf breaking` in CI makes incompatible API changes a build failure, not a runtime
  surprise for TUI users on an older client.
- Protobuf/gRPC is a better fit for React Native later than a hand-rolled REST/JSON API
  would be, and the same schema is intended to serve mobile eventually (see
  `docs/product/roadmap.md`, "Mobile transport").
- gRPC over HTTP/2 requires deliberate ingress configuration (h2/h2c handling at the Fly
  edge) — this is a real deployment cost, tracked in `docs/operations/deployment.md`.
- Browser clients can't speak raw gRPC natively; a browser client (not planned for v0/MVP)
  would need grpc-web or a Connect-style gateway.
- Engineers must learn protobuf/Buf workflow rather than "just add a REST route," which is
  a small ongoing tax in exchange for the type-safety and versioning guarantees.

## Alternatives considered

- **GraphQL.** Rejected: explicitly prohibited (`INITIAL_VISION.md` §0, §153). Adds a
  resolver/schema-stitching layer and N+1 query risk without buying anything gRPC/protobuf
  doesn't already provide for this client shape.
- **tRPC.** Rejected: ties the API tightly to TypeScript-only clients, undermining the
  "open architecture, multiple future clients" principle and complicating a future
  ActivityPub-facing HTTP surface.
- **Hand-written REST + OpenAPI.** Rejected: weaker type-safety guarantees in practice,
  no built-in breaking-change detection equivalent to `buf breaking`, and no clean story for
  a second native client reusing the same generated types.

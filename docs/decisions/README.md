# Architecture Decision Records

This directory records consequential architectural and technology decisions for Patches,
following the lightweight ADR format. Use an ADR when a decision would be expensive to
reverse, closes off other options, or is likely to be second-guessed later without a
written record of why it was made. Routine implementation choices don't need one.

Keep ADRs short: context, decision, consequences, alternatives considered. See
`INITIAL_VISION.md` §131 for the source requirement.

ADRs 0011–0014 record Amendment A to the spec (`INITIAL_VISION.md` §162–§177). Read the
amendment first — the ADRs explain _why_; the amendment is what implementers must follow.

ADR 0017 records a decision from Amendment B (§178–§195); §195 lists what that amendment
deliberately does **not** authorize without owner sign-off.

## Index

| ADR                                                  | Title                                                                                           | Status   |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------- |
| [0001](./0001-modular-monolith.md)                   | Modular monolith backend architecture                                                           | Accepted |
| [0002](./0002-grpc-protobuf.md)                      | gRPC + Protobuf as the client/server protocol                                                   | Accepted |
| [0003](./0003-typeorm-postgres.md)                   | TypeORM on PostgreSQL as the persistence layer                                                  | Accepted |
| [0004](./0004-postgres-outbox.md)                    | PostgreSQL-backed job queue and transactional outbox instead of Redis/Kafka                     | Accepted |
| [0005](./0005-r2-media-storage.md)                   | Cloudflare R2 for media storage with direct client upload                                       | Accepted |
| [0006](./0006-activitypub-later.md)                  | ActivityPub federation deferred behind a gateway seam                                           | Accepted |
| [0007](./0007-ink-terminal-client.md)                | Ink (React for terminals) as the primary client framework                                       | Accepted |
| [0008](./0008-pnpm-turborepo-monorepo.md)            | pnpm workspaces + Turborepo monorepo                                                            | Accepted |
| [0009](./0009-typescript-5-not-7.md)                 | Pin TypeScript 5.9.x instead of TypeScript 7                                                    | Accepted |
| [0010](./0010-argon2id-jose-jwt.md)                  | Argon2id password hashing with short-lived JWT access tokens and opaque rotating refresh tokens | Accepted |
| [0011](./0011-credentials-separate-from-identity.md) | Credentials are separate from identity (password / SSH key / GitHub device flow)                | Accepted |
| [0012](./0012-patches-pages-portable-declarative.md) | Patches Pages are a portable declarative document, rendered by clients                          | Accepted |
| [0013](./0013-node-model-and-earlier-federation.md)  | Patches is node software; `patches.social` is the reference node; federation moves earlier      | Accepted |
| [0014](./0014-capabilities-not-tiers.md)             | Capabilities, not tiers, in the protocol                                                        | Accepted |
| [0015](./0015-minio-for-local-media-dev.md)          | MinIO for local media dev, Cloudflare R2 in production                                          | Accepted |
| [0016](./0016-connect-transport-and-client-sdk.md)   | Connect protocol for web/mobile clients, and a shared client SDK                                | Accepted |
| [0017](./0017-server-visible-dms.md)                 | Direct messages are server-visible in v0, not end-to-end encrypted                              | Accepted |
| [0018](./0018-tui-interaction-model.md)              | TUI interaction model: measured frame, screen stack, composited overlays                        | Accepted |
| [0020](./0020-e2ee-direct-messages.md)               | End-to-end encrypted direct messages                                                            | Accepted |

## Template

Copy this when adding a new ADR. Number sequentially, zero-padded to four digits.

```markdown
# NNNN. Title

**Status:** Proposed | Accepted | Superseded by NNNN | Deprecated
**Date:** YYYY-MM-DD

## Context

What problem or forcing function led to this decision? What constraints applied?

## Decision

What was decided, stated plainly.

## Consequences

What becomes easier, harder, or is foreclosed as a result. Include both positive and
negative consequences honestly.

## Alternatives considered

What else was evaluated, and why it wasn't chosen.
```

# Architecture Decision Records

This directory records consequential architectural and technology decisions for Patches,
following the lightweight ADR format. Use an ADR when a decision would be expensive to
reverse, closes off other options, or is likely to be second-guessed later without a
written record of why it was made. Routine implementation choices don't need one.

Keep ADRs short: context, decision, consequences, alternatives considered. See
`INITIAL_VISION.md` §131 for the source requirement.

## Index

| ADR | Title | Status |
| --- | --- | --- |
| [0001](./0001-modular-monolith.md) | Modular monolith backend architecture | Accepted |
| [0002](./0002-grpc-protobuf.md) | gRPC + Protobuf as the client/server protocol | Accepted |
| [0003](./0003-typeorm-postgres.md) | TypeORM on PostgreSQL as the persistence layer | Accepted |
| [0004](./0004-postgres-outbox.md) | PostgreSQL-backed job queue and transactional outbox instead of Redis/Kafka | Accepted |
| [0005](./0005-r2-media-storage.md) | Cloudflare R2 for media storage with direct client upload | Accepted |
| [0006](./0006-activitypub-later.md) | ActivityPub federation deferred behind a gateway seam | Accepted |
| [0007](./0007-ink-terminal-client.md) | Ink (React for terminals) as the primary client framework | Accepted |
| [0008](./0008-pnpm-turborepo-monorepo.md) | pnpm workspaces + Turborepo monorepo | Accepted |
| [0009](./0009-typescript-5-not-7.md) | Pin TypeScript 5.9.x instead of TypeScript 7 | Accepted |
| [0010](./0010-argon2id-jose-jwt.md) | Argon2id password hashing with short-lived JWT access tokens and opaque rotating refresh tokens | Accepted |

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

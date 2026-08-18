# 0003. TypeORM on PostgreSQL as the persistence layer

**Status:** Accepted
**Date:** 2026-08-17

## Context

Patches needs a relational data model from the start: users, actors, posts, threads, the
social graph, media, reactions, notifications, moderation records, and eventually federated
actors/objects that must fit the same tables as local ones. The team is standardized on
NestJS/TypeScript, and the spec mandates avoiding both NoSQL databases and newer
TypeScript-first ORMs that haven't been load-bearing as long, in favor of an established,
Nest-friendly ORM with mature migration tooling.

## Decision

Use **PostgreSQL** as the only database (Fly Managed Postgres in production, Docker Compose
Postgres locally, same major version in both places), and **TypeORM 1.x** as the ORM, in the
**Data Mapper / repository** style — not Active Record. Entities represent persistence only;
business logic lives in NestJS services, not on entities. Inside a TypeORM transaction,
always use the transaction-scoped `EntityManager`, never a global repository. Avoid eager
relation loading and broad cascades by default; every cascade must be intentional and
documented. Production configuration is `synchronize: false` — schema changes go through
reviewed, versioned migrations only (see ADR migrations discussion in
`docs/operations/database.md`).

## Consequences

- One well-understood relational model backs the whole social graph, including the future
  federation seam (remote actors/posts fit the same tables per `INITIAL_VISION.md` §110)
  without a parallel document store.
- Migrations are explicit, reviewed, and run as a release step — no risk of `synchronize:
  true` silently mutating a production schema.
- Repository-style TypeORM keeps a clean separation between persistence and domain logic
  (see `INITIAL_VISION.md` §128 on DTO/domain/persistence separation), so TypeORM entities
  never leak directly across the gRPC boundary.
- TypeORM's transaction API requires discipline (always use the supplied `EntityManager`
  inside a transaction) — a subtle bug class if contributors reach for the default injected
  repository out of habit.
- Committing to PostgreSQL means no cheap horizontal write-scaling later without real
  sharding work; acceptable, since the performance target is hundreds to low thousands of
  active users (`INITIAL_VISION.md` §125), not global scale.

## Alternatives considered

- **Prisma.** Rejected: explicitly prohibited (`INITIAL_VISION.md` §0, §153). Also less
  aligned with the plain repository-pattern approach this spec wants.
- **Drizzle, Sequelize, MikroORM.** Rejected: explicitly prohibited as general persistence
  layers; no compelling advantage over TypeORM for this project's needs.
- **Raw SQL / a query builder with no ORM.** Rejected as the *general* approach — too much
  boilerplate and repetition for the CRUD-heavy majority of the schema — though raw
  SQL/manual migrations remain acceptable for PostgreSQL-specific indexes TypeORM can't
  express well.
- **MongoDB / Firestore / DynamoDB / Supabase-as-database.** Rejected: explicitly
  prohibited. The social graph and thread structure are fundamentally relational, and a
  document store would fight that shape rather than help it.

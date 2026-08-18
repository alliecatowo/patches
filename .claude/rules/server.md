---
paths:
  - "apps/server/**"
  - "apps/worker/**"
  - "apps/admin/**"
---

# Server/worker/admin rules

- **Controllers are transport adapters only.** No business logic, no direct repository/EntityManager access in a controller — call an application service and map its result to a protobuf message (spec §128).
- **Services hold logic.** DTO in, domain/service logic, entity out only as far as the repository boundary — never let an entity escape the service layer into a controller.
- **Never return a TypeORM entity over gRPC** (spec §153). Map to a protobuf message explicitly, field by field or via a dedicated mapper — no blind-spread mapping that could leak a column you didn't mean to expose.
- **Transactions**: always use the transactional `EntityManager` (`dataSource.transaction(async (manager) => ...)`) for multi-step writes — never mix a transactional and non-transactional repository call within the same logical operation.
- **Error codes**: map domain/application errors to gRPC status codes through the shared error mapper (spec §57) — don't throw raw `Error` across the controller boundary and don't invent ad hoc status codes per controller.
- **Never log secrets or tokens** — no raw JWTs, refresh tokens, passwords, or API keys in structured logs (spec §98, §101). Redact or omit.
- **Config via validated env only** (`packages/config`, zod schema) — no `process.env.X` reached into directly from application code; go through the typed config service.
- **Graceful shutdown** (spec §124): handle `SIGTERM`, stop accepting new work, drain in-flight requests/jobs, close the DB pool, then exit.
- **Module format**: CJS, `module: NodeNext`, no `"type": "module"` — NestJS 11 has no native ESM support (`docs/research/nestjs-grpc-protobuf.md`). Decorators need `experimentalDecorators`/`emitDecoratorMetadata` — run Nest via its compiled/ts-node CJS path, not `tsx` (its transform doesn't reliably emit decorator metadata for Nest's DI).
- **Worker jobs**: claim via `SKIP LOCKED`, implement backoff and a dead-letter path — no bare retry loops (spec §11, §13).
- **Rate limit** sensitive flows (login, register, password reset, verification resend) — db-backed since there's no Redis in v0 (spec §102).

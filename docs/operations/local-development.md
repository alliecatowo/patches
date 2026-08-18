# Local development

Describes the local dev environment per `INITIAL_VISION.md` §§96–97. The goal, per spec, is
that first-run setup is boring: `mise install && pnpm install && docker compose up -d &&
pnpm db:migrate && pnpm dev` should just work.

## Prerequisites

- **mise** (https://mise.jdx.dev/) for toolchain version management. This repo's
  `mise.toml` pins:
  - `node` 24.19.0
  - `pnpm` 11.22.0
  - `buf` 1.72.0
  - `docker-compose` 5.4.0
  - `actionlint` 1.7.12
- **podman** or **docker**, with compose support, for local Postgres/Mailpit/MinIO.

## Quickstart

```bash
mise install
pnpm install
docker compose up -d      # or: podman compose up -d
pnpm db:migrate
pnpm dev
```

## Compose services

**Status: planned — compose file to be added under `infra/compose/` (or repo root
`docker-compose.yml`) during Phase 0/1.** The target service set:

- **postgres** — primary database, matching the production PostgreSQL major version.
- **mailpit** — local SMTP catcher, so registration/verification/password-reset emails can
  be sent and inspected in a browser UI during development without touching Resend or a
  real inbox.
- **minio** (optional) — S3-compatible local object store, standing in for Cloudflare R2.
  Using MinIO is optional; it should also be easy to point local development directly at an
  R2 dev bucket instead, since R2 is already S3-compatible. Don't force MinIO on
  contributors who'd rather use a real R2 dev bucket.

podman is used as the primary local container runtime per this environment's tooling
(`docker-compose` pinned via mise); either `podman compose` or `docker compose` should work
against the same compose file since both speak the Compose spec.

## Environment variables

Configuration is validated at startup via `@nestjs/config` — the application must refuse to
boot if required production configuration is malformed. Never commit real secrets; use
`.env.local` (gitignored) for local values and `fly secrets` in production (see
`docs/operations/deployment.md`).

```text
NODE_ENV

DATABASE_URL

GRPC_HOST
GRPC_PORT

PUBLIC_ORIGIN

JWT_PRIVATE_KEY
JWT_PUBLIC_KEY

R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
R2_ENDPOINT

RESEND_API_KEY
EMAIL_FROM

INVITE_ONLY
```

Notes:

- `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` back the asymmetric access-token signing described in
  `docs/decisions/0010-argon2id-jose-jwt.md`. For local dev, generate a throwaway keypair —
  never reuse a production keypair locally.
- `R2_*` variables can point at either a real R2 dev bucket or a local MinIO instance
  (matching MinIO's S3-compatible endpoint/credentials shape).
- In local development, email sending should point at Mailpit's SMTP endpoint rather than
  Resend, so verification/reset flows don't require a real email provider account to
  develop against.
- `INVITE_ONLY` gates registration behind an invite code, per the alpha registration flow
  (`INITIAL_VISION.md` §38).

## Running the apps

- `pnpm dev` — runs the server (and, once it exists, the worker) via Turborepo's task
  graph.
- The TUI (`apps/tui`) is run separately (`pnpm --filter tui dev` or equivalent) against the
  local gRPC server — see `apps/tui`'s own instructions once Phase 0 lands the hello-world
  client.

## Troubleshooting

- **`pnpm install` fails on native deps (e.g. `@napi-rs/keyring`, `sharp`).** These are
  native/prebuilt-binary packages; confirm the pinned Node version matches what the
  prebuilt binaries target (`mise install` should already guarantee this) and that your
  platform is supported. `@napi-rs/keyring` in particular may not function in every
  headless/Termux-like environment — this is expected and handled defensively by the
  `CredentialStore` abstraction, not a broken install.
- **Server fails to boot citing missing/invalid configuration.** This is `@nestjs/config`
  validation doing its job — check `.env.local` against the variable list above; the
  server intentionally refuses to start with malformed production-shaped configuration
  rather than booting into an undefined state.
- **gRPC client can't reach the server.** Confirm `GRPC_HOST`/`GRPC_PORT` match between the
  server's bind config and the TUI/client's target, and confirm the server actually started
  (check logs) before assuming a network issue.
- **Emails never arrive during local testing.** Confirm the app is configured to send via
  Mailpit locally, not Resend, and check the Mailpit web UI (default `http://localhost:8025`
  once the compose service is configured) rather than a real inbox.
- **Postgres connection refused.** Confirm `docker compose ps` (or `podman compose ps`)
  shows postgres healthy, and that `DATABASE_URL` matches the compose service's exposed
  port/credentials.
- **Migrations fail against a stale local schema.** Since `synchronize: false` is enforced
  everywhere (see `docs/operations/database.md`), a schema drift usually means a migration
  wasn't run — run `pnpm db:migrate` again, and if the local DB is unrecoverably out of
  sync, it's disposable: drop it (`docker compose down -v`) and re-run the quickstart.

## Related documents

- `docs/operations/database.md` — migration policy.
- `docs/operations/deployment.md` — how this environment's configuration maps to
  production.
- `docs/decisions/0008-pnpm-turborepo-monorepo.md` — why pnpm/Turborepo/mise.

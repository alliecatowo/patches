# Deployment

**Status: deployed 2026-08-18.** The flagship node, Fly app `patches-social` (org
"personal", region `iad`), is live at `patches-social.fly.dev:443` and has been exercised
end to end with two real accounts (register, login, post, follow, like, reply, thread,
notifications, home feed — see "First deploy" below). `infra/docker/Dockerfile`,
`infra/fly/fly.toml`, and `.github/workflows/deploy.yml` are what shipped it; the deploy
workflow itself is still gated behind `vars.FLY_DEPLOY_ENABLED` (unset) — the live deploy so
far was done by hand with `flyctl`, not yet through CI. Media uploads and verification email
are **not** working on this node yet (dashboard-only R2/Resend credentials — see "Secrets"
below and `tasks.md` B-031); federation is off by design. Sections describing genuinely
not-yet-exercised steps (custom domain, autoscaling, log drain, Neon) still say
`Status: planned`.

Per `INITIAL_VISION.md` §§84–91, §122, §141.

## Target architecture

```text
                     Internet
                        |
                    Fly Proxy
                        |
                     HTTP/2 (TLS) -> h2c
                        |
                  +-----v------+
                  | server      |  <- Fly process group "server" (public)
                  | NestJS gRPC |
                  +-----+------+
                        |
             +----------+-----------+
             |                      |
             v                      v
     Fly Managed Postgres      Cloudflare R2
             |
        +----v-------+
        | worker     |  <- Fly process group "worker" (private, no public service)
        | NestJS     |
        | standalone |
        +------------+
```

One Docker image (`infra/docker/Dockerfile`), two Fly.io process groups
(`infra/fly/fly.toml`'s `[processes]`). No Kubernetes, no self-managed VM, no serverless
decomposition.

## Container: `infra/docker/Dockerfile`

Multi-stage build, four stages: `base` (Node 24 + pnpm via corepack + the `buf` CLI, needed
because `packages/proto`'s `gen` script has no npm-installable equivalent), `fetch` (warms
the pnpm content-addressable store from `pnpm-lock.yaml` alone, cached across builds via a
BuildKit `--mount=type=cache`), `build` (full source, offline install, `pnpm turbo run
build --filter=@patches/server --filter=@patches/worker`, then `pnpm --filter <app> deploy
--prod --legacy /deploy/<app>` to produce two self-contained app directories with workspace
deps copied in rather than symlinked), and `runtime` (`node:24-slim`, non-root `node` user,
no build toolchain, `NODE_ENV=production`).

**Build context is the repo root** (the pnpm workspace needs the whole monorepo), so the
Dockerfile lives at `infra/docker/Dockerfile` but is always invoked from the repo root:

```bash
podman build -t patches:local -f infra/docker/Dockerfile .
# or: mise run docker:build   (tries podman first, falls back to docker)
```

`.dockerignore` lives at the **repo root** (not next to the Dockerfile) — ignore files are
resolved against the build context, not the Dockerfile's own directory.

### Why `--legacy` on `pnpm deploy`

pnpm 10+ defaults `pnpm deploy` to "injected" (hard-linked) workspace dependencies, which
assumes the deployed package stays inside the workspace's `node_modules` layout. That's
wrong for a Docker runtime stage, which needs each app's `node_modules` to be genuinely
self-contained so it can be `COPY`'d out on its own. `--legacy` switches to the old
behavior — copying each workspace dependency's built files into the deployed package's own
`node_modules` — which is what actually works here. Verified locally: `pnpm --filter
@patches/server deploy --prod --legacy /tmp/deploy-server` produces a working, portable
`/tmp/deploy-server` (confirmed `node_modules/@patches/{config,database,media,proto}`
present as real directories, not symlinks); without `--legacy` it fails outright with
`ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE`.

Neither `apps/server/package.json` nor `apps/worker/package.json` declares a `"files"`
field, so `pnpm deploy` copies the whole package directory (`src/`, `test/`,
`tsconfig*.json`, not just `dist/`) into the image — functionally harmless (dead weight,
not a correctness issue) but slightly bloats the runtime layer (~100-120 MB per app
directory before the shared base image). Adding `"files": ["dist"]` to those two
`package.json`s would trim this; left as a follow-up since P7-001's owned file set doesn't
include `apps/server`/`apps/worker` source or manifests.

### Running database migrations (`release_command`)

`packages/database`'s own CLI (`pnpm --filter @patches/database migration:run`) runs
TypeScript source through `tsx`, a devDependency that a `pnpm deploy --prod` image
deliberately excludes. Rather than adding a production-only entrypoint inside
`packages/database` (out of scope for P7-001), `infra/docker/migrate.mjs` calls the
already-compiled `createDataSource` export that `@patches/server` already ships in its own
`node_modules` after `pnpm deploy` — it's copied to `server/migrate.mjs` in the runtime
image specifically so Node's ESM resolution finds `@patches/database` there. It reads
`DATABASE_URL`/`DATABASE_SSL`/`DATABASE_SSL_CA`/`DATABASE_LOGGING` from the environment
(same variables `packages/database`'s own CLI reads), calls `dataSource.initialize()` +
`runMigrations({ transaction: 'each' })`, and exits. See that file's header comment for the
full rationale, and `docs/operations/database.md` for migration policy generally.

If `packages/database` ever grows its own compiled migration entrypoint, prefer that and
delete `infra/docker/migrate.mjs`.

### What's been verified locally (no Fly account needed)

- `podman build -t patches:local -f infra/docker/Dockerfile .` — proto codegen (`buf
generate`), and the `tsup` builds for `@patches/config`/`@patches/media`/
  `@patches/proto`/`@patches/database`/`@patches/testkit`, all succeed inside the
  container. **Blocked at the final `apps/server`/`apps/worker` `tsc` step** as of
  2026-08-18 by an unrelated, concurrently in-progress change to
  `apps/server/src/modules/auth/auth.guard.ts` (a different agent's uncommitted work in
  this shared checkout, confirmed via `git status`/`git diff` — not caused by anything in
  this Dockerfile). Re-run once that lands; nothing about the Docker mechanics themselves
  is in question past that point given how far the build got.
- `pnpm --filter @patches/server deploy --prod --legacy /tmp/deploy-server` and the
  `@patches/worker` equivalent — both verified directly (see above).
- `podman run --rm patches:local node server/dist/main.js --help` — **not yet run**; blocked
  on the same `apps/server` build failure above (the image never finished building). Run
  this (or `... node server/dist/main.js` with `DATABASE_URL` pointed at
  `postgres://patches:patches@host.containers.internal:5432/patches` to prove full boot)
  once the image builds.
- `infra/fly/fly.toml` — valid TOML (parsed with Python's `tomllib`), and its shape (one
  `app`, `[processes]` with `server`/`worker`, `[[services]]` scoped to `server` only via
  `processes = ["server"]`, `[deploy].release_command`) matches
  `docs/research/fly-io.md`'s verified Fly config syntax. **Never deployed** — no Fly
  account in this environment.
- `.github/workflows/deploy.yml` — `actionlint` clean. **Never run through CI** — still gated
  behind `vars.FLY_DEPLOY_ENABLED` (unset), so the workflow itself is a no-op even though the
  node it would deploy is now live (deployed by hand with `flyctl` instead — see "First
  deploy" below).

## First deploy (2026-08-18)

The blocking `apps/server`/`apps/worker` `tsc` failure noted above (a different agent's
concurrent, since-landed change) cleared, and the image built and deployed successfully.
Exact commands run, in order:

```bash
flyctl apps create patches-social --org personal
flyctl postgres create ...                                       # cluster patches-social-db
flyctl postgres attach -a patches-social patches-social-db        # sets DATABASE_URL secret

flyctl secrets set --config infra/fly/fly.toml -a patches-social \
  JWT_PRIVATE_KEY=... JWT_PUBLIC_KEY=... FEDERATION_KEY_ENCRYPTION_KEY=...
  # (DATABASE_URL was already set by `postgres attach`, above)

flyctl deploy --config infra/fly/fly.toml --remote-only
  # builds registry.fly.io/patches-social:build-<sha>, runs the release_command
  # (node server/migrate.mjs) before the new server/worker Machines take traffic

flyctl proxy 15432:5432 -a patches-social-db
  # separate terminal, used to run patches-admin invite create against prod Postgres:
  # DATABASE_URL=postgres://...@127.0.0.1:15432/patches \
  #   pnpm --filter @patches/admin start invite create --by allie --max-uses 5
```

Secrets set (names only — see `docs/operations/local-development.md` for what each is):
`DATABASE_URL`, `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `FEDERATION_KEY_ENCRYPTION_KEY`. Not
set (media/email disabled until dashboard-only credentials are fetched — `tasks.md` B-031):
`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`,
`RESEND_API_KEY`.

Non-secret env, from `infra/fly/fly.toml`'s `[env]`: `NODE_ENV=production LOG_LEVEL=log
GRPC_HOST=0.0.0.0 GRPC_PORT=50051 HTTP_PORT=8080 PUBLIC_ORIGIN=https://patches-social.fly.dev
NODE_DOMAIN=patches-social.fly.dev INVITE_ONLY=true FEDERATION_ENABLED=false
EMAIL_PROVIDER=console EMAIL_FROM=noreply@patches-social.fly.dev`.

**Gotcha: `LOG_LEVEL` is `log`, not `info`.** The server's logger factory
(`apps/server/src/common/logging/logger.factory.ts`) uses Nest's own `LogLevel` union, whose
"normal operation" level is literally named `log` — setting `LOG_LEVEL=info` (a very natural
guess coming from most other Node logging libraries) is accepted by nothing here and either
falls through to a default or produces confusing output; use `log`.

**Production bug found and fixed during this deploy**: the Nest hybrid app (HTTP health
listener + gRPC microservice in the same process) needed
`connectMicroservice(options, { inheritAppConfig: true })` — without that second argument,
every handled application error surfaced to gRPC clients as bare `INTERNAL` instead of the
mapped `x-patches-error-code`/status. See `docs/agents/LEARNINGS.md` for the full entry.

**Live smoke check**:

```bash
node apps/tui/dist/cli.js ping
# {"ok":true,"target":"patches-social.fly.dev:443",...}
```

**Verified end to end** (tmux, two real accounts — first via `register` bootstrap since
`users` was empty, second via an invite from `patches-admin invite create` run through the
`flyctl proxy` above): register, login, `whoami`, compose + post, `/` search → profile,
`f` follow, `l` like, `g n` notifications (LIKE + FOLLOW entries appear), `r` reply,
`Enter` thread, `g h` home feed shows the followed account's post.

**Not working in production yet** (see `tasks.md` B-031): image uploads (no R2 S3 access
keys — the bucket `patches-media` exists via `wrangler r2 bucket create`, but generating S3
credentials for it is dashboard-only), verification email (`EMAIL_PROVIDER=console` — codes
land in `flyctl logs`, not an inbox; Resend needs a verified sending domain), federation
(`FEDERATION_ENABLED=false` by design for v0.0).

### "First deploy" checklist

- [x] Fly app created (`patches-social`, org personal, region `iad`).
- [x] Postgres provisioned and attached (Fly Postgres cluster `patches-social-db`; not yet
      Fly Managed Postgres — see "Production database" above).
- [x] Required secrets set (`JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`,
      `FEDERATION_KEY_ENCRYPTION_KEY`; `DATABASE_URL` set automatically by `postgres attach`).
- [x] Image built and deployed (`flyctl deploy --config infra/fly/fly.toml --remote-only`).
- [x] `release_command` (`node server/migrate.mjs`) ran migrations successfully before traffic
      cutover.
- [x] `server` (gRPC 50051, Fly TLS on 443, `h2_backend`) and `worker` process groups both
      running.
- [x] Smoke ping passes (`patches ping` against the live host).
- [x] End-to-end social loop verified with two real accounts.
- [ ] R2 media credentials set (**planned** — dashboard-only, `tasks.md` B-031).
- [ ] Resend sending domain verified (**planned** — dashboard-only, `tasks.md` B-031).
- [ ] Deploy workflow exercised through CI (**planned** — `vars.FLY_DEPLOY_ENABLED` still
      unset; this deploy was done by hand).
- [ ] Custom domain `patches.social` (**planned** — node currently only reachable at
      `patches-social.fly.dev`).
- [ ] Fly Managed Postgres or Neon switch (**planned** — see "Production database" above).
- [ ] Autoscaling / `[[vm]]` sizing tuned for real traffic (**planned** — default single
      Machine per process group so far).
- [ ] Log drain wired up (**planned** — `fly logs`/dashboard live-tail only today).

## Process groups (`infra/fly/fly.toml`)

```toml
[processes]
  server = "node server/dist/main.js"
  worker = "node worker/dist/main.js"
```

One image, two Fly Machines-per-group. Note the paths: `pnpm deploy` (see above) flattens
each app into its own top-level directory in the image (`server/`, `worker/`), **not**
`apps/server/dist/main.js` — a common mistake if copy-pasting an example that assumes the
monorepo's own layout persists into the image.

If gRPC and a later HTTP federation listener end up awkward on the same public ports within
one Fly app, the plan (per `INITIAL_VISION.md` §87) is to deploy separate Fly apps from the
same image rather than build a bespoke reverse-proxy hack.

## gRPC ingress

TLS terminates at the Fly edge; the `server` process group speaks plain h2c behind it.
Per `docs/research/fly-io.md` §2 (verified 2026-08-18 against fly.io/docs), there is no
dedicated `"grpc"` handler — gRPC rides HTTP/2 via `[[services.ports]] handlers = ["tls",
"http"]` plus `[services.ports.http_options] h2_backend = true`, which is what
`infra/fly/fly.toml` sets. Production client connections use TLS end to end from the
client's perspective (`grpc.patches.social:443`, once DNS exists).

## Health checks

**No native gRPC check type exists on Fly** (documented — `docs/research/fly-io.md` §3;
only `http`/`tcp`). `infra/fly/fly.toml` uses a `[[services.tcp_checks]]` against the gRPC
`internal_port` (50051) as the pragmatic fallback this task's scope allows (it can't touch
`apps/server` source to add a real HTTP health listener) — a TCP check only confirms the
socket accepts connections, not that gRPC itself is healthy. `apps/server` already
implements the standard `grpc.health.v1.Health` service internally (`grpc-health-check`,
see `apps/server/src/grpc-options.ts`) for gRPC-aware clients/probes, which is a different,
additional thing from Fly's platform-level check and doesn't substitute for it.
**Follow-up**: add a small plain-HTTP listener alongside the gRPC microservice (the Nest
"hybrid app" pattern, `docs/research/nestjs-grpc-protobuf.md` §3) and point an `http_checks`
entry at it instead, once that's in scope for an `apps/server`-owning task.

## Production database

Per `docs/research/fly-io.md` §6 (verified 2026-08-18): Fly now steers new provisioning
toward **Fly Managed Postgres** (`fly mpg create`/`fly mpg attach`) rather than the older
self-managed "Fly Postgres" (`fly postgres create`), which Fly's own docs now describe as
unsupported for new projects. `docs/decisions/0003-typeorm-postgres.md` specifies Fly Managed
Postgres as the intended target.

**What actually happened on the first deploy (2026-08-18)**: the live node runs on a **Fly
Postgres cluster** (`patches-social-db`), not Fly Managed Postgres — `flyctl postgres attach`
was used and set the `DATABASE_URL` secret automatically. The original plan was to use Neon
instead (or Fly Managed Postgres), but `neonctl` isn't authenticated in this environment, so
Fly Postgres was the pragmatic choice to get a working node live. Switching to Fly Managed
Postgres or Neon later is a planned follow-up, not required for the node to function today.

```bash
# what was actually run:
flyctl postgres create ...            # cluster patches-social-db
flyctl postgres attach -a patches-social patches-social-db   # sets DATABASE_URL secret
```

**Status: planned** (Fly Managed Postgres path below — not what the live node uses):

```bash
fly mpg create --name patches-db --org <org> --region iad --plan Basic
fly mpg attach <cluster-id> -a <app-name>   # sets DATABASE_URL automatically
```

`fly mpg attach` sets a pooled (PgBouncer) `DATABASE_URL` by default; a direct
(non-pooled) URL is also available if a session-scoped connection is ever needed (long-lived
LISTEN/NOTIFY, an advisory lock, etc. — nothing in this codebase currently needs one).
Backup/PITR specifics (exact retention window, point-in-time recovery granularity) are
**not** stated in Fly's fetched marketing/overview docs as of the research pass — get the
exact numbers from the Fly dashboard or support before writing a firm RPO/RTO into
`docs/operations/backups.md`.

## Secrets

Set via `fly secrets set`, never committed. Full variable list:
`docs/operations/local-development.md`'s "Environment variables" section. Exact commands
(fill in real values before running):

```bash
fly secrets set --config infra/fly/fly.toml \
  DATABASE_URL="postgres://..." \
  JWT_PRIVATE_KEY="$(base64 -w0 < jwt-private.pem)" \
  JWT_PUBLIC_KEY="$(base64 -w0 < jwt-public.pem)" \
  R2_ACCOUNT_ID="..." \
  R2_ACCESS_KEY_ID="..." \
  R2_SECRET_ACCESS_KEY="..." \
  R2_BUCKET="patches-media" \
  R2_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com" \
  RESEND_API_KEY="..." \
  EMAIL_FROM="noreply@patches.social" \
  INVITE_ONLY="true"
```

(`fly mpg attach` sets `DATABASE_URL` automatically — the line above is only needed if
connecting an externally-provisioned Postgres instead.) `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY`
generation: `pnpm keys:generate` (see root `package.json`).

**R2 bucket + CORS (Status: planned)**: create a dedicated R2 bucket
(`patches-media` or similar) via the Cloudflare dashboard or `wrangler`, generate an R2 API
token scoped to that bucket (Account → R2 → Manage API Tokens), and configure CORS on the
bucket to allow the production origin(s) that need direct browser/client uploads (see
`docs/decisions/0005-r2-media-storage.md` and `packages/media` for the presigned-URL upload
flow this backs). No specific CORS JSON is prescribed here yet — write it once
`packages/media`'s actual upload origins are finalized.

**Resend (Status: planned)**: create a Resend account, verify the sending domain
(`patches.social` or the actual chosen domain) via its DNS records (SPF/DKIM/DMARC), and
generate an API key scoped to sending only.

## Error monitoring

**Status: decided; log drain setup planned (needs live environment).**

Decision (per `INITIAL_VISION.md` §100/§159 "error monitoring works or a documented
alternative exists"): Patches v0 does **not** wire in Sentry (or any third-party error
tracker). The documented alternative is structured JSON logs plus Fly's own log
infrastructure:

- `apps/server` and `apps/worker` already emit structured JSON logs in production
  (`NODE_ENV=production`) through the shared logger factory
  (`apps/server/src/common/logging/logger.factory.ts`) — every request/RPC is logged with a
  request-context (actor/session where available), and unhandled errors are surfaced as
  structured `rpc.error` events by `apps/server/src/common/errors/rpc-exception.filter.ts`
  rather than bare stack traces. `apps/worker`'s job runner (`apps/worker/src/jobs/`) uses
  the same logger factory for its own job lifecycle/error logging; dedicated federation
  delivery/inbox counters are tracked as a separate follow-up (see `tasks.md` A-036) and are
  not yet emitted.
- Once deployed, `fly logs`/the Fly dashboard give a live tail of this structured output for
  free. For retention/search beyond Fly's short live-tail window, Fly supports shipping logs
  to an external log drain (destination — Loki, Datadog, or similar — is an operator choice,
  not prescribed here); the exact `flyctl`/`fly.toml` incantation for wiring up a drain is
  **not verified in this environment** (no live Fly app to test it against) — confirm against
  `fly logs --help`/current Fly docs at setup time rather than assuming a specific flag or
  config block from this note.
- Alerting is **log-based**, not APM-based: a rule watching for `level: "error"` /
  `rpc.error` events (or a spike in their rate) in whatever the log drain's destination
  supports (most log-drain backends — Grafana Loki, Datadog, etc. — support alert rules on
  log content), routed to whatever the team's current communication channel is at the time
  (see `docs/operations/incidents.md`'s detection step).
- Why not Sentry: it would be the first third-party SaaS dependency purely for
  observability, with its own DSN-as-secret to manage and a stack-trace-shipping surface
  that needs privacy review before it ships to a hosted service; structured logs already
  carry the same "what broke and where" information without that added dependency, which
  fits the project's minimal-infrastructure bias (spec §153's no-unnecessary-managed-service
  posture, applied here by extension). Revisit if log-based alerting proves insufficient
  once there's real production traffic.
- Nothing here has been exercised against a live Fly log drain — there is no deployed node
  in this environment to point a drain at. The application-side structured logging itself
  is implemented and covered by existing server/worker tests; only the drain/alerting setup
  remains **planned**.

## Domains

Per `INITIAL_VISION.md` §91:

```text
patches.social              marketing/docs
api.patches.social          future HTTP API
grpc.patches.social         gRPC
social.patches.social       federation origin if desired
```

**Status: planned** — no domain purchased/configured from this environment.
`fly certs add grpc.patches.social --config infra/fly/fly.toml` provisions a Fly-managed
TLS cert once DNS points at the app; confirm the current `fly certs` flags against
`fly certs --help` at setup time (not independently re-verified for this note).

## CI/CD

```text
pull request
    |
CI (format, lint, typecheck, buf checks, build, unit + integration tests, migration check)
    |
merge to main
    |
CI runs again on main -> ci-ok
    |
Deploy workflow (workflow_run, triggered by CI's completion) -> flyctl deploy --remote-only
    |  (release_command runs migrations first, before new Machines take traffic)
    |
smoke test (patches ping against the deployed host)
```

`.github/workflows/deploy.yml` implements this, gated behind `vars.FLY_DEPLOY_ENABLED`
(unset today — every deploy/smoke step no-ops until a human sets it once a real Fly app +
`FLY_API_TOKEN` secret exist). Deploy credentials are never exposed to pull requests from
forks — the workflow only triggers off `workflow_run` (main-only) and manual dispatch, both
of which run with the repo's own secrets, never a fork's.

## Smoke tests

`.github/workflows/deploy.yml`'s final step reuses the TUI's existing non-interactive
`patches ping` subcommand (`apps/tui/src/cli/ping.ts` — one real
`SystemService.GetServerInfo` gRPC round trip, JSON output, exit 0/1) against
`vars.FLY_GRPC_HOST:443` over TLS, rather than writing a second, parallel gRPC smoke-test
client. **Status: planned** — never run against a real deployment.

## Graceful shutdown

Already implemented in application code (`apps/server/src/main.ts` calls
`app.enableShutdownHooks()` and flips the gRPC health status to `NOT_SERVING` on
`SIGTERM`/`SIGINT` before Nest's own shutdown hooks drain the process; `apps/worker`
similarly stops claiming new jobs on shutdown — see `apps/worker/src/main.ts`). Fly can
terminate Machines on its own schedule; nothing here assumes a generous shutdown window.

## npm packaging (`@patches/tui`)

See `apps/tui/README.md` for the full picture, including the **known gap**: a real
`npm install -g @patches/tui` from the public registry won't work yet, because it depends
on two still-private, unpublished workspace packages (`@patches/proto`,
`@patches/terminal-media`). Verified locally: packing all three with `pnpm pack` and
installing the `@patches/tui` tarball into a scratch project with `pnpm-workspace.yaml`
`overrides` pointing at the other two tarballs works end to end (`patches --version`
prints `0.1.0`, exit 0) — but that override is exactly what a real registry install can't
do. A real `pnpm publish` of `@patches/tui` (and, separately, deciding whether to publish
the other two packages or bundle them at build time) is a later, manual/CI action —
**Status: planned**, not attempted here.

## Related documents

- `docs/research/fly-io.md` — the verified Fly.io config reference this doc builds on.
- `docs/operations/database.md` — migration policy.
- `docs/operations/backups.md` — backup/restore procedure.
- `docs/operations/incidents.md` — rollback and incident response.

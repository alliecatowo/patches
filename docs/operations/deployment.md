# Deployment

**Status: deployed 2026-08-18.** The flagship node, Fly app `patches-social` (org
"personal", region `iad`), is live at `patches-social.fly.dev:443` and has been exercised
end to end with two real accounts (register, login, post, follow, like, reply, thread,
notifications, home feed — see "First deploy" below). `infra/docker/Dockerfile`,
`infra/fly/fly.toml`, and `.github/workflows/deploy.yml` are what shipped it. The current live
revision was deployed by hand; the CI path is implemented but has never completed a deploy and
is currently held closed until the one-time auth-envelope rollout succeeds. Media uploads use the production R2
bucket and verification email is sent through Resend from the verified
`noreply@updates.allisons.dev` sender; federation is off by design. As of 2026-08-18 (A-041),
production `DATABASE_URL` points at **Neon**, not the original Fly Postgres cluster — see
"Production database" below. Sections describing genuinely not-yet-exercised steps (custom
domain, autoscaling, log drain) still say `Status: planned`.

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
         Neon Postgres         Cloudflare R2
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
- `.github/workflows/deploy.yml` — `actionlint` clean. **Never completed through CI** — the
  required variable, endpoint, and token now exist, but the latest `main` CI run failed before
  the deploy gate (the node itself was deployed by hand; see "First deploy" below).

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

Non-secret env, from `infra/fly/fly.toml`'s `[env]`: `NODE_ENV=production E2EE_UNREVIEWED_DEV_MODE=true LOG_LEVEL=log
GRPC_HOST=0.0.0.0 GRPC_PORT=50051 HTTP_PORT=8080 PUBLIC_ORIGIN=https://patches-social.fly.dev
NODE_DOMAIN=patches-social.fly.dev INVITE_ONLY=true FEDERATION_ENABLED=false
EMAIL_PROVIDER=console EMAIL_FROM=noreply@patches-social.fly.dev`.

**ADR 0027 disposable-node E2EE opt-in** — this owner-authorized no-user node deliberately sets
`E2EE_UNREVIEWED_DEV_MODE=true`. This permits only the isolated-test `patches-franking-v1` path;
it does not add a globally approved profile or describe the protocol as reviewed or secure.
`NODE_ENV=production` remains required for normal runtime behavior and is not a deployment trust
classification. Remove the flag before the node handles non-disposable data or real users.

**A-052 (spec §197.6) operator-transparency env** — also set in `infra/fly/fly.toml`'s
`[env]`, published unauthenticated via `NodeService.GetNodePolicy`: `PRIVACY_NOTICE_SUMMARY`
(what's stored, what's public, that DMs are end-to-end encrypted but visible to the node as
metadata, retention, export/deletion, contact — summarizing `docs/product/privacy.md`),
`TERMS_URL` (points at the full `docs/product/privacy.md` on GitHub — there is no separate ToS
page), `APPEAL_INSTRUCTIONS` (the in-client Appeals screen, or email the operator),
`OPERATOR_CONTACT` (who runs this node), and `DATA_LOCATION` (Fly for compute, Neon Postgres in
`aws-us-east-2` for the database, Cloudflare R2 for media). See the file itself for the exact
published text — **as of this sweep (B-097) `infra/fly/fly.toml`'s `PRIVACY_NOTICE_SUMMARY`
still asserts the retired ADR 0017 wording ("Direct messages are NOT end-to-end encrypted —
this node's operator can read them"), which is now false; it needs updating and redeploying,
tracked separately from this docs sweep.**

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

**Production integrations verified**: media uploads use R2 S3 credentials and the
`patches-media` bucket; verification messages use Resend and the verified
`updates.allisons.dev` sending domain. Federation remains disabled by design for v0.0
(`FEDERATION_ENABLED=false`).

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
- [x] R2 media credentials set and a live upload/derivative flow verified.
- [x] Resend API key and verified `updates.allisons.dev` sending domain configured.
- [ ] Deploy workflow exercised through CI (**planned** — configuration is present, but the
      latest `main` CI run failed before the deploy gate; prior deploys were manual).
- [ ] Custom domain `patches.social` (**planned** — node currently only reachable at
      `patches-social.fly.dev`).
- [x] Neon switch (production `DATABASE_URL` migrated off Fly Postgres 2026-08-18, A-041 —
      see "Production database" above).
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

**Status: implemented; verify with `flyctl checks list` after deploy.**

**No native gRPC check type exists on Fly** (documented — `docs/research/fly-io.md` §3;
only `http`/`tcp`). `infra/fly/fly.toml` keeps the `[[services.tcp_checks]]` against the
gRPC `internal_port` (50051) — it only confirms the socket accepts connections, not that the
app is actually healthy — alongside a real application-level check (A-043):

```toml
[checks]
  [checks.healthz]
    type = "http"
    port = 8080
    method = "get"
    path = "/healthz"
    interval = "15s"
    timeout = "3s"
    grace_period = "10s"
    processes = ["server"]
```

`GET /healthz` (`apps/server/src/modules/system/health.controller.ts` /
`health.service.ts`) reports **200** only when the database answers `SELECT 1` **and** the
`grpc.health.v1.Health` status is `SERVING`, **503** otherwise — a top-level `[checks]`
entry rather than `[[services.http_checks]]` because port 8080 isn't a routed/public
`[[services]]` block; `[checks]` targets a port directly, independent of request routing.

`/healthz` is served differently depending on `FEDERATION_ENABLED` (`main.ts`):

- **`FEDERATION_ENABLED=false`** (production default, spec §176): a standalone,
  single-route HTTP listener (`apps/server/src/modules/system/healthz-server.ts`) binds
  `HTTP_PORT` and answers only `/healthz` — deliberately **not** Nest's own HTTP adapter.
  `AppModule` imports `FederationModule` (webfinger/actor/inbox/outbox controllers)
  unconditionally, and those controllers don't re-check `FEDERATION_ENABLED` themselves
  (unlike `FederationMetricsController`) — they stay unreachable only because nothing binds
  a port for Nest's adapter. Binding that adapter to serve `/healthz` would have also
  opened the federation HTTP surface on every node, contradicting the "zero new network
  surface when federation is off" invariant documented on `FEDERATION_ENABLED` in
  `env.schema.ts`. The standalone listener sidesteps that entirely.
- **`FEDERATION_ENABLED=true`**: `main.ts` calls `app.listen(HTTP_PORT)` on Nest's full HTTP
  adapter as before, and `HealthController` answers `/healthz` from the same port alongside
  the federation routes.

Both paths call the same `HealthService.check()`, so the response is identical either way.
`apps/server` also implements the standard `grpc.health.v1.Health` service internally
(`grpc-health-check`, see `apps/server/src/grpc-options.ts`) for gRPC-aware clients/probes —
a different, additional thing from either Fly check above.

## Production database

**Status: implemented 2026-08-18 (A-041).** Production `DATABASE_URL` on `patches-social`
now points at **Neon** — project `patches` (id `shy-recipe-96135980`, org
`org-plain-leaf-04797948`, region `aws-us-east-2`), default branch `production`
(`br-twilight-dew-axkmolfo`), database `neondb`, role `neondb_owner`, `sslmode=require`. Get
the current connection string (never print it in a log or commit it):

```bash
neonctl connection-string --project-id shy-recipe-96135980 --api-key "$NEON_API_KEY" \
  | sed 's/&channel_binding=require//'
```

(`--api-key` reads `NEON_API_KEY`, kept in the repo-root `.env`, gitignored — not committed.
The `sed` strips `channel_binding=require`, which TypeORM's `pg` driver in this codebase
doesn't need and which has caused connection issues with some pg client stacks; verified
working without it.)

**History**: the first deploy (2026-08-18, see "First deploy" above) ran on a self-managed
**Fly Postgres cluster** (`patches-social-db`, `flyctl postgres attach`) because `neonctl`
wasn't authenticated in this environment at the time. Once it was, the data was migrated to
Neon and `DATABASE_URL`/`DATABASE_SSL` secrets were repointed. The Fly Postgres cluster is
now **stopped** and kept as a cold fallback (not actively serving traffic); its volume
(`vol_r1j3on1n5m85wpwr`) has scheduled daily snapshots with 14-day retention (`flyctl volumes
update vol_r1j3on1n5m85wpwr --snapshot-retention 14`) so it isn't itself an unbacked-up
liability while it's kept around.

**Cutting production over to a restored/branched database** (e.g. after a Neon branch
restore — see `docs/operations/backups.md`):

```bash
flyctl secrets set -a patches-social DATABASE_URL=<connection string> DATABASE_SSL=true
# rolls patches-social's Fly Machines onto the new DATABASE_URL
```

Neon provides both point-in-time recovery and instant branching
(`neonctl branches create --project-id shy-recipe-96135980 --parent production`) as backup/
restore primitives — see `docs/operations/backups.md` for the full backup/restore runbook,
including a restore drill actually run against this project on 2026-08-18.

**Not used**: Fly Managed Postgres (`fly mpg`) was considered per `docs/research/fly-io.md`
§6 and `docs/decisions/0003-typeorm-postgres.md`, but Neon was chosen instead for the actual
migration — that ADR predates this decision and is not updated by this change (ADRs are
`architect`'s territory; see `tasks.md` A-041 for the open question of whether it needs a
formal update or a new ADR).

## Secrets

Set via `fly secrets set`, never committed. Full variable list:
`docs/operations/local-development.md`'s "Environment variables" section. Exact commands
(fill in real values before running):

```bash
fly secrets set --config infra/fly/fly.toml \
  DATABASE_URL="postgres://..." \
  JWT_PRIVATE_KEY="$(base64 -w0 < jwt-private.pem)" \
  JWT_PUBLIC_KEY="$(base64 -w0 < jwt-public.pem)" \
  AUTH_CODE_DELIVERY_ACTIVE_KEY_ID="prod-YYYY-MM" \
  AUTH_CODE_DELIVERY_KEYS='{"prod-YYYY-MM":"<32-byte-base64-key>"}' \
  R2_ACCOUNT_ID="..." \
  R2_ACCESS_KEY_ID="..." \
  R2_SECRET_ACCESS_KEY="..." \
  R2_BUCKET="patches-media" \
  R2_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com" \
  RESEND_API_KEY="..." \
  EMAIL_FROM="Patches <noreply@updates.allisons.dev>" \
  INVITE_ONLY="true"
```

(`fly mpg attach` sets `DATABASE_URL` automatically — the line above is only needed if
connecting an externally-provisioned Postgres instead.) `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY`
generation: `pnpm keys:generate` (see root `package.json`).

`AUTH_CODE_DELIVERY_KEYS` is a JSON keyring shared by the server (encrypts verification and
password-reset jobs) and worker (decrypts them); `AUTH_CODE_DELIVERY_ACTIVE_KEY_ID` selects
the write key. It must be independent of the JWT keypair. Rotate additively: add the new key
to both processes first, deploy, switch the active id, wait until every pre-rotation auth job
is terminal, then remove the old key.

### One-time auth-envelope rollout

**Status: planned — not exercised against Fly.** The commands below are the reviewed operator
sequence for the first rollout; do not treat them as a record of a completed deployment.

Migration `1787420562003-AuthCodeDeliveryEnvelopes` adds a constraint that rejects the old
plaintext auth-email job shape. Therefore the first rollout **must not use the automatic
GitHub deploy workflow**: its normal rolling strategy could leave an old server producing
plaintext jobs after the migration is applied. Use this one-time quiesced rollout, accepting
a short sign-in/registration outage:

1. Set the GitHub production environment variable `FLY_DEPLOY_ENABLED=false` and confirm no
   deploy run is active. Record current counts with
   `fly scale show --app patches-social --config infra/fly/fly.toml`.
2. Put only the two `AUTH_CODE_DELIVERY_*` assignments above in a mode-0600 temporary file,
   then stage them without restarting Machines:
   `fly secrets import --stage --app patches-social < auth-envelope-secrets.env`. Remove that
   temporary file immediately after the command succeeds.
3. Build and push the reviewed commit while the old version is still serving:
   `fly deploy --app patches-social --config infra/fly/fly.toml --build-only --push
--build-arg PATCHES_BUILD_SHA=<full-reviewed-commit-sha>`. Record the exact registry image
   reference printed by Fly.
4. Quiesce every old producer and consumer:
   `fly scale count 0 --app patches-social --process-group server --yes`, then
   `fly scale count 0 --app patches-social --process-group worker --yes`. Confirm both are zero
   with `fly scale show` before continuing.
5. Deploy the already-built image (the release command applies the migration while no old
   process can enqueue): `fly deploy --app patches-social --config infra/fly/fly.toml
--image <recorded-registry-image> --strategy immediate`.
6. Restore the exact server and worker counts recorded in step 1 with separate
   `fly scale count <count> --process-group <group> --yes` commands. Run the deployment smoke
   checks below and exercise verification and password reset. Finally set both
   `FLY_DEPLOY_ENABLED=true` and `AUTH_CODE_ENVELOPE_ROLLOUT_COMPLETE=true` in the GitHub
   production environment to enable routine later releases.

If build or review fails, stop before step 4. Once step 5 applies the constraint, do not roll
back to the plaintext-producing image; fix forward with the reviewed envelope-aware image.

**R2 bucket + CORS (Status: deployed)**: the dedicated `patches-media` bucket and scoped S3
credentials back the presigned-URL upload/derivative flow. Browser-origin CORS remains a
client-specific follow-up; the current TUI upload path does not require it.

**Resend (Status: deployed)**: `updates.allisons.dev` is verified and production sends as
`Patches <noreply@updates.allisons.dev>` using the scoped `RESEND_API_KEY` Fly secret.

**`PUBLIC_READ` (Status: implemented, default unchanged on the live deploy)**: owner decision,
2026-08-19 — `INVITE_ONLY` gates _posting_, not _reading_; this node's public content stays
readable logged-out by default (`PUBLIC_READ=true`, the default, so nothing needs to change on
`patches-social.fly.dev` to keep today's behavior). An operator who wants a fully closed node
sets `fly secrets set PUBLIC_READ=false` (or the env var directly for a self-hosted node):
every RPC outside `SystemService.*`, `NodeService.GetNodeInfo`/`GetNodePolicy`, and
`AuthService.*` then requires a session (`UNAUTHENTICATED`/`SIGN_IN_REQUIRED`) — see
`apps/server/src/common/guards/public-read.guard.ts` and `docs/architecture/api.md` §7.

**`PASSWORD_AUTH` (Status: implemented, default unchanged on the live deploy)**: P15-002 —
`off | optional | required`, default `optional` (unchanged behavior). An operator who wants
to force SSH/GitHub-only sign-in sets `fly secrets set PASSWORD_AUTH=off`: `Login`, a
password-carrying `Register`, and `AddCredential(PASSWORD)` then reject with
`FAILED_PRECONDITION`/`PASSWORD_AUTH_DISABLED`, and `AuthService.GetAuthPolicy` tells clients
to hide password UI. `required` is accepted but not yet enforced — see
`docs/architecture/auth.md` §10.

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

`.github/workflows/deploy.yml` implements this. The complete `vars.FLY_GRPC_HOST` endpoint and
a `FLY_API_TOKEN` secret are configured. Routine deployment requires both
`vars.FLY_DEPLOY_ENABLED=true` and `vars.AUTH_CODE_ENVELOPE_ROLLOUT_COMPLETE=true`; the latter
must remain false/unset until the one-time rollout above is exercised. The path has not completed
a real CI-triggered deploy. Deploy credentials are never exposed to pull requests from
forks — the workflow only triggers off `workflow_run` (main-only) and manual dispatch, both
of which run with the repo's own secrets, never a fork's.

## Smoke tests

`.github/workflows/deploy.yml`'s final step reuses the TUI's existing non-interactive
`patches ping` subcommand (`apps/tui/src/cli/ping.ts` — one real
`SystemService.GetServerInfo` gRPC round trip, JSON output, exit 0/1) against
the complete `vars.FLY_GRPC_HOST` endpoint over TLS, rather than writing a second, parallel gRPC smoke-test
client. **Status: planned** — never run against a real deployment.

The workflow also passes the exact validated commit as `PATCHES_BUILD_SHA` at image build time.
`GetServerInfo.server_version` consequently reports `<package-version>+<short-sha>` in deployed
images, while local/unidentified builds retain the plain package version. This makes a smoke-test
response directly comparable with the web footer's build identity.

## Graceful shutdown

Already implemented in application code (`apps/server/src/main.ts` calls
`app.enableShutdownHooks()` and flips the gRPC health status to `NOT_SERVING` on
`SIGTERM`/`SIGINT` before Nest's own shutdown hooks drain the process; `apps/worker`
similarly stops claiming new jobs on shutdown — see `apps/worker/src/main.ts`). Fly can
terminate Machines on its own schedule; nothing here assumes a generous shutdown window.

## npm packaging (`patches-social`, P9-003 / A-046)

See `apps/tui/README.md`'s "Self-contained build" section for the full picture. Summary:
`apps/tui/tsup.config.ts` bundles the app and its three private workspace dependencies
(`@patches/domain`, `@patches/proto`, `@patches/terminal-media`) into a single
`dist/cli.js`, so the published tarball no longer needs those unpublished packages resolved
separately — the earlier known gap (an `npm install -g` 404ing on them) is closed.

The npm-facing package name is `patches-social` (the bare `patches` name is taken; checked
2026-08-18). It's set via `publishConfig.name` in `apps/tui/package.json` — a pnpm 11.18+
feature (this repo pins 11.22.0) that publishes under a different name than the workspace's
own `package.json` `name`, which stays `@patches/tui`. That means every `--filter
@patches/tui` reference elsewhere in the repo (`mise.toml`, root `package.json`, CI
workflows) is untouched by this.

Verified locally (2026-08-18), from a shell with the repo's `node_modules` off `PATH`,
against the live node:

```bash
pnpm --filter @patches/tui build
pnpm --filter @patches/tui pack --pack-destination /tmp/patches-tui-pack
# -> /tmp/patches-tui-pack/patches-social-0.1.0.tgz (~80 KB)

mkdir -p /tmp/pfx/bin
PATH="/tmp/pfx/bin:$PATH" PNPM_HOME=/tmp/pfx pnpm add -g /tmp/patches-tui-pack/patches-social-*.tgz
cd /tmp && /tmp/pfx/bin/patches --version   # -> 0.1.0
cd /tmp && /tmp/pfx/bin/patches ping --server patches-social.fly.dev:443   # -> {"ok": true, ...}
```

Inspecting the packed `package.json` confirmed `pnpm-workspace.yaml`'s `catalog:` entries
resolve to concrete semver ranges at pack time (e.g. `"ink": "^7.1.1"`, not the literal
string `catalog:`) — required for the tarball to be installable by a plain `npm install`,
not just within this pnpm workspace.

GitHub prerelease tarballs are published and are the supported installation channel today;
see `docs/operations/try-it.md` for the current URL.

**npm registry status: blocked on authentication** — publishing itself (`npm login`, then `mise exec -- pnpm --filter
@patches/tui publish --access public`, using the workspace-local filter name; pnpm rewrites
the published name to `patches-social` via `publishConfig.name`) is a manual, one-time step
for the package owner and hasn't been run — `npm login` isn't available in this
environment. Everything up to producing and installing the tarball is verified above.

## Related documents

- `docs/research/fly-io.md` — the verified Fly.io config reference this doc builds on.
- `docs/operations/database.md` — migration policy.
- `docs/operations/backups.md` — backup/restore procedure.
- `docs/operations/incidents.md` — rollback and incident response.

# Fly.io — `fly.toml`, process groups, gRPC ingress, Managed Postgres, CI deploy

Verified: 2026-08-18 against fly.io/docs (current, non-versioned — Fly's docs have no version
selector; content reflects the platform as of this date) and `github.com/superfly/flyctl-actions`.
CI authentication was re-verified on **2026-08-22** against Fly's access-token and flyctl
integration docs; §9 supersedes its older `fly auth token` guidance.
Current stack in this repo: one deployed Docker image (`apps/server` + `apps/worker` built from
the same monorepo), two Fly process groups (`server` = NestJS gRPC app, `worker` = NestJS
standalone worker), and production PostgreSQL on Neon. Fly Managed Postgres remains researched
in §6 but is not the live provider. `infra/fly/fly.toml` exists and the `patches-social` app was
deployed on 2026-08-18; see `docs/operations/deployment.md` for exercised application state.

Everything below is **documented** platform behavior unless marked "inferred" or "unverified".
The targeted 2026-08-22 re-verification covered CI authentication only; implementation claims
elsewhere retain their original 2026-08-18 evidence level.

---

## 1. `fly.toml` basics: `app`, `[build]`, `[processes]`

```toml
app = "patches"
primary_region = "iad"        # sets deployment region + PRIMARY_REGION env var

[build]
  dockerfile = "infra/docker/Dockerfile"   # or [build] image = "..." for a prebuilt image

[processes]
  server = "node apps/server/dist/main.js"
  worker = "node apps/worker/dist/main.js"
```

- `app` (required), `primary_region` (sets `PRIMARY_REGION` env var on Machines), `[build]`
  (dockerfile/builder/image config) are documented top-level/near-top-level keys.
- `[processes]` is a table mapping **process group name → startup command**; each command is
  what actually runs inside the (single, shared) image for Machines assigned to that group.
  Documented example:
  ```toml
  [processes]
  web = "bundle exec rails server -b [::] -p 8080"
  worker = "bundle exec sidekiqswarm"
  ```
  This confirms the core mechanism this repo needs: **one image, two `[processes]` entries**
  (`server`, `worker`), each a different entrypoint into the same built `dist/`.
  (fly.io/docs/reference/configuration/)

---

## 2. Exposing gRPC/HTTP2 behind Fly's edge

Documented current syntax — `[[services]]` (long form) with nested `[[services.ports]]`:

```toml
[[services]]
  internal_port = 50051
  protocol = "tcp"
  processes = ["server"]        # scopes this service block to the `server` process group

  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443

  [services.ports.http_options]
    h2_backend = true
```

- `internal_port`: the port the app process listens on inside the Machine.
- `protocol`: `"tcp"` or `"udp"` at the `[[services]]` level (gRPC is TCP).
- **`processes = [...]`** on a `[[services]]` block is the documented field that scopes a
  service definition to Machines in a specific named process group — this is exactly the
  "one image, per-group `[[services]]` blocks" mechanism needed to expose only `server`
  (not `worker`) publicly.
- `[[services.ports]]` (array — can have multiple, e.g. one for port 80 redirect, one for 443) with `handlers = ["tls", "http"]` is the documented pattern for TLS-terminated HTTPS.
- **`h2_backend`** lives under `[services.ports.http_options]` (nested under the `ports`
  array entry, not a sibling of `handlers`) and is documented as enabling "HTTP/2 cleartext
  (H2C) with prior knowledge" to the backend — i.e. Fly's edge terminates TLS/HTTP2 from the
  client and speaks **h2c** to your Machine, which is what a plain (non-TLS) gRPC server
  listening on `internal_port` needs. This is the currently-documented mechanism for gRPC
  ingress; there is **no dedicated `"grpc"` handler** — gRPC works by riding HTTP/2 with
  `h2_backend = true`.
  (fly.io/docs/reference/configuration/)

**`[http_service]` shorthand**: also current and documented (`internal_port`, `force_https`,
`processes`, `auto_stop_machines`/`auto_start_machines`/`min_machines_running`,
`[http_service.concurrency]`, `[http_service.http_options]` — including `h2_backend` —
`[http_service.tls_options]`, `[[http_service.checks]]`). Docs state it as a simplified
replacement for `[[services]]` "for apps that only need HTTP and HTTPS services," and its own
`processes` field is documented as behaving the same as the `[[services]]` one (scope to a
process group). **Inferred**: for this repo, prefer the long-form `[[services]]` +
`[services.ports.http_options]` over `[http_service]`, since `[http_service]` is explicitly
framed as the simple case and the docs' own worked gRPC/h2c example under "Multiple services"
uses the long form — but both are current, neither is deprecated as of this date. Confirm the
exact `[http_service]` + `h2_backend` combination against a real deploy before relying on it;
the fetch used for this note could not produce a full worked `[http_service]` + `h2_backend`
example, only the field list.

**Discrepancy check**: no evidence `h2_backend`/`http_options` has been renamed or moved in a
"newer platform version" — Fly's config docs are a single living page (Apps V2/Machines
platform), not versioned like Fly's old Nomad-era docs. Nothing here should be assumed stable
forever; re-verify at implementation time since Fly's docs explicitly warn config surface
changes without a versioned migration path.

---

## 3. Health checks

Two independent mechanisms, both documented:

1. **Per-service checks**, tied to a `[[services]]`/`[http_service]` block:
   ```toml
   [[services.tcp_checks]]
     grace_period = "1s"
     interval = "15s"
     timeout = "2s"

   [[services.http_checks]]
     interval = 10000        # ms when given as a bare integer
     grace_period = "5s"
     method = "get"
     path = "/"
     protocol = "http"
     timeout = 2000
   ```
2. **Top-level `[checks]`**, independent of request routing/load-balancer membership:
   ```toml
   [checks]
     [checks.name_of_your_http_check]
       grace_period = "30s"
       interval = "15s"
       method = "get"
       path = "/path/to/status"
       port = 5500
       timeout = "10s"
       type = "http"

     [checks.name_of_your_tcp_check]
       grace_period = "30s"
       interval = "15s"
       port = 1234
       timeout = "10s"
       type = "tcp"
   ```
   `[checks.<name>]` entries support a `processes` field too (scope to a process group), plus
   `type` = `"http"` or `"tcp"`.
   (fly.io/docs/reference/configuration/)

**gRPC health checks**: **not natively supported**. The documented check types are `http` and
`tcp` only (`tcp_checks`, `http_checks`, and `[checks]` `type = "http" | "tcp"`) — no
`grpc_checks` / `type = "grpc"` exists in the current schema. For a gRPC service, the
documented-compatible options are:

- a **TCP check** against the gRPC listen port (`internal_port`), which only confirms the
  socket accepts connections, not that gRPC itself is healthy; or
- exposing a **separate plain HTTP health endpoint** (e.g. the Nest hybrid-app pattern from
  `docs/research/nestjs-grpc-protobuf.md` §3, a small HTTP listener alongside the gRPC
  microservice) and pointing an `http_checks`/`[checks]` entry at that port instead.

**Inferred** (not stated in the fetched docs, standard gRPC ecosystem knowledge — flag for
verification): grpc-health-check's standard `grpc.health.v1.Health/Check` protocol is not
something Fly's edge/checks system speaks; Fly checks are plain HTTP GET / TCP connect only.
This repo already plans a `grpc-health-check` package integration in the NestJS server
(`docs/research/nestjs-grpc-protobuf.md` §3) for **gRPC clients** (e.g. Kubernetes-style gRPC
health probing) — that is a different, additional thing from Fly's platform-level checks and
does not substitute for it. **Recommendation for implementation**: run the hybrid-app pattern
(HTTP port + gRPC port in the same process) and check the HTTP port from Fly.

---

## 4. `release_command`

Documented location: nested under `[deploy]`, not top-level:

```toml
[deploy]
  release_command = "bin/rails db:prepare"

[deploy.release_command_vm]
  size = "performance-1x"
  memory = "8gb"
```

- Runs **once per deploy attempt**, before new Machines with the new image version receive
  traffic.
- Runs in a **separate, temporary Machine** built from the newly-built image (not one of the
  app's persistent process-group Machines).
- Documented verbatim: "By default, the temporary Machine has full access to the network,
  environment variables and secrets, but _not_ to persistent volumes." — i.e. `release_command`
  **does** get the same env vars/secrets as the app, but **does not** get any mounted volume.
  This matters for TypeORM migrations (`pnpm db:migrate`) run as the `release_command`: DB
  connection secrets (`DATABASE_URL`) are available, but nothing that depends on a volume.
- `[deploy.release_command_vm]` lets you size the one-off release Machine differently from the
  app's own Machines (e.g. more memory for a migration).
  (fly.io/docs/reference/configuration/)

**Inferred**: since `[processes]` defines multiple named groups, and `release_command` is a
single top-level `[deploy]` key with no per-process-group variant documented, it runs **once
per deploy for the whole app**, not once per process group. Confirm this doesn't need to be
scoped when the `server`/`worker` processes are deployed independently (`fly deploy --process-group`
style flows) — not covered by the docs fetched for this note; flag for verification at
implementation time.

---

## 5. Process groups: multiple groups from one image

Confirmed mechanism, combining §1 and §2:

```toml
[processes]
  server = "node apps/server/dist/main.js"
  worker = "node apps/worker/dist/main.js"

[[services]]
  internal_port = 50051
  protocol = "tcp"
  processes = ["server"]        # only server-group Machines get this service/ingress

  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443
  [services.ports.http_options]
    h2_backend = true

[[services.tcp_checks]]
  # implicitly scoped to the [[services]] block above (server group) via its position
```

- One built Docker image is shared by every Machine regardless of process group; `[processes]`
  just picks which command each group's Machines run.
- Each `[[services]]` (or `[http_service]`) block is scoped to a subset of process groups via
  its own `processes = [...]` array field — confirmed as the documented mechanism, not
  inferred. The `worker` group in this repo should simply have **no** `[[services]]` block
  referencing it (or an explicit `processes = ["worker"]` block with no public ports, if it
  needs a private/internal service), since it's a background job runner, not a request target.
  (fly.io/docs/reference/configuration/)

---

## 6. Fly Managed Postgres (MPG)

**Current recommendation, confirmed**: Fly has two distinct Postgres offerings, and the docs
now explicitly steer new users to the managed one.

- **"Fly Postgres" (unmanaged)** — `fly postgres create` — Postgres run on your own Fly
  Machines, self-managed. Docs state directly (fly.io/docs/postgres/getting-started/what-you-should-know/):
  > "We are not able to provide support or guidance for unmanaged Postgres. We now offer
  > Fly.io Managed Postgres, our fully-managed database service that handles all aspects of
  > running production PostgreSQL databases."
  > This is Fly's own current framing of unmanaged Postgres as unsupported/legacy — not
  > formally labeled "deprecated" with a removal date in the fetched text, but steered away
  > from for new projects.
- **"Fly Managed Postgres" (MPG)** — `fly mpg create` — the currently recommended offering.
  Docs describe it as handling "high availability, automatic failover, encrypted backups,
  monitoring and metrics, seamless scaling, and 24/7 support." (fly.io/docs/postgres/getting-started/what-you-should-know/,
  fly.io/docs/mpg/)

**Provisioning** — `fly mpg create [flags]`, documented flags (fly.io/docs/flyctl/mpg-create/):
`-n/--name`, `-o/--org`, `-r/--region`, `--plan` (Basic/Starter/Launch/Scale/Performance),
`--volume-size` (GB, default 10), `--pg-major-version` (16 or 17, default 16),
`--enable-postgis-support`, `--pgvector`.

**Connecting an app** — `fly mpg attach <clusterID> -a <app-to-attach>` (flyctl) or via the
dashboard "Connect" tab. Confirmed: **a `DATABASE_URL` secret is set automatically** on
attach — the pooled connection URL (through PgBouncer) is assigned to `DATABASE_URL` by
default; a direct (non-pooled) URL is also available for cases like migrations that need a
session-scoped connection, and the env var name is customizable at attach time.
(fly.io/docs/mpg/create-and-connect/)

**Backup/PITR**: documented only at a high level — "Automatic backups and recovery" and "High
availability with automatic failover" are listed as included features, and "All plans include
high availability, backups, and connection pooling." **No specific backup frequency, retention
window, or PITR granularity is stated** in the pages fetched for this note. **Flag for
verification**: before relying on MPG for a stated RPO/RTO in an ADR or runbook, get the exact
retention/PITR window from Fly support or the dashboard UI directly — the marketing/overview
docs don't specify it.

**Local access**: `fly mpg connect` (direct psql), `fly mpg proxy` (local port-forward, e.g.
`postgres://fly-user:<password>@localhost:16380/fly-db`).

**Discrepancy to flag for an ADR**: if any existing Patches doc/ADR (check `docs/decisions/`
and `docs/research/typeorm-postgres.md`) assumes "Fly Postgres" in the old unmanaged sense
(e.g. references to `postgres-ha`/Nomad-style Postgres apps, manual HA config, or running
Postgres as another Fly app you operate yourself), that's now the deprecated path — Fly's own
current docs push new provisioning toward `fly mpg create`. This is exactly the kind of
"official docs contradict an assumption" case called out in the researcher mandate; **architect**
should confirm which one the infra ADR intends and update accordingly if it's ambiguous.

---

## 7. Secrets

```bash
fly secrets set NAME=VALUE NAME2=VALUE2
```

Documented usage/synopsis: `fly secrets set [flags] NAME=VALUE NAME=VALUE ...`
(fly.io/docs/flyctl/secrets-set/). The fetched secrets-set reference page itself doesn't
restate the env-var-injection mechanism, but §4 above independently confirms (from the
`[deploy]`/`release_command` docs) that secrets **are** injected as environment variables into
both regular app process Machines and the one-off `release_command` Machine — that's the
documented behavior of secrets generally on Fly (Machines get them as env vars at boot), and
`release_command`'s own docs explicitly reconfirm it ("full access to ... environment variables
and secrets").

---

## 8. Non-root Docker user + Fly Machines

**Unverified / inferred — flag for verification before relying on it.** No official Fly page
was found in this pass that states an explicit requirement (or prohibition) around running
the container's main process as non-root. Secondary evidence (Fly community forum threads,
not an authoritative source per the priority order in spec §132 — flagged accordingly): Fly's
Machines runtime creates the stdout/stderr pipes for the container **owned by the user/group
the image's `USER` directive starts as**, so a non-root `USER` in the Dockerfile is supported,
but has caused reported permission issues writing to `/dev/stdout`/`/dev/stderr` for some
images in the past. **Recommendation**: keep a non-root `USER` in `infra/docker/Dockerfile` (no
Fly-specific rule against it), but explicitly test that `console.log`/Node's stdout writes
work correctly for the built image in a real Fly deploy before treating this as settled —
this is exactly the kind of claim that needs re-verification at implementation time, not
something to take on training-knowledge/forum authority.

---

## 9. CI deploy: `flyctl deploy --remote-only` + `FLY_API_TOKEN`

Confirmed pattern from `github.com/superfly/flyctl-actions` (the official GitHub Action):

```yaml
name: Deploy to Fly
on: [push]
jobs:
  deploy:
    name: Deploy app
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

- `superfly/flyctl-actions/setup-flyctl` installs `flyctl` on the runner; the actual deploy is
  a plain `flyctl deploy` invocation, not a dedicated action step with deploy-specific inputs.
- `--remote-only` builds the image on Fly's remote builder rather than requiring a local/CI
  Docker daemon — the documented reason to use it in CI.
- `FLY_API_TOKEN` is read from the environment by `flyctl` itself. Fly's current
  [CI integration guide](https://fly.io/docs/flyctl/integrating/) says an app-scoped deploy
  token is the default for CI: `fly tokens create deploy -a <app> -x <duration>`. It explicitly
  says not to use `fly auth token` in CI because that is a full personal token.
- The [access-token guide](https://fly.io/docs/security/tokens/) recommends the narrowest scope
  and shortest workable expiry. App deploy tokens can manage only one app; org tokens are for
  pipelines that must manage multiple apps. Tokens default to 20 years if expiry is omitted,
  so expiry and rotation must be deliberate.
- Store the deploy token as the GitHub `production` environment secret
  `FLY_API_TOKEN`, inject it only into the deploy step, and keep the existing environment branch
  protection/approval boundary. No official Fly GitHub OIDC exchange flow was found on
  2026-08-22; this remains a rotatable provider token rather than GitHub-native federation.

**Official-doc discrepancy:** Fly's older
[GitHub Actions tutorial](https://fly.io/docs/launch/continuous-deployment-with-github-actions/)
still suggests an extremely long `-x 999999h` deploy token and mentions the broader personal
token as an alternative. The newer access-token and generic CI integration guides explicitly
recommend short expiry, app scope, and never using `fly auth token` in CI. Follow the newer,
security-specific guidance.

**Inferred**: for the `server`/`worker` two-process-group setup in this repo, a single
`flyctl deploy --remote-only` deploys the whole app (all process groups) from the one
`fly.toml`/image — there's no evidence of a documented per-process-group deploy flag needed
for the common case; `fly deploy` ships Machines for every `[processes]` entry from the same
build. Flag for verification if partial/independent deploys of just `worker` or just `server`
turn out to be needed later (relevant to the `release_command` scoping question in §4).

---

## Sources

- fly.io/docs/reference/configuration/ — `[processes]`, `[[services]]`, `[[services.ports]]`,
  `[services.ports.http_options]` (`h2_backend`), `[http_service]`, `[[services.tcp_checks]]`,
  `[[services.http_checks]]`, `[checks]`, `[deploy]`/`release_command`,
  `[deploy.release_command_vm]`
- fly.io/docs/mpg/ — Managed Postgres overview, features (HA, backups, connection pooling)
- fly.io/docs/mpg/create-and-connect/ — `fly mpg attach`, `DATABASE_URL` auto-set behavior,
  pooled vs. direct URLs, `fly mpg connect`/`fly mpg proxy`
- fly.io/docs/flyctl/mpg-create/ — `fly mpg create` flags
- fly.io/docs/postgres/getting-started/what-you-should-know/ — unmanaged Postgres
  unsupported-status statement, pointer to Managed Postgres
- fly.io/docs/flyctl/secrets-set/ — `fly secrets set` usage
- fly.io/docs/security/tokens/ — app/org token scopes, expiry, listing, and revocation
- fly.io/docs/flyctl/integrating/ — current generic CI integration and least-privilege token
  guidance
- github.com/superfly/flyctl-actions — README, `setup-flyctl` action, `FLY_API_TOKEN` usage
- (flagged secondary, §8 only) community.fly.io threads on non-root `USER` + stdout/stderr
  pipe ownership — not authoritative, verify against a real deploy

## Suggested follow-up (not filed by this note — researcher scope is `docs/research/**` only)

- **ADR needed:** the live database is Neon even though `INITIAL_VISION.md` and ADR 0003 name
  Fly Managed Postgres. `docs/research/neon-branching.md` records this provider discrepancy.
- **Task:** the app and `infra/fly/fly.toml` have been exercised manually, but the GitHub
  Actions path is still gated. Create a short-lived app-scoped deploy token, configure the
  production environment secret/protection rules, enable the deployment variable, run one
  real CI deployment, and record the result in the operations runbook.
- **Task:** rotate the Fly deploy token on a defined schedule and revoke the old token by ID;
  do not inherit the older tutorial's effectively permanent expiry.

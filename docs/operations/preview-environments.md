# Preview environments (per-PR)

**Status: implemented (B-105 + full-stack follow-up, same day), never exercised end
to end.** The workflow (`.github/workflows/preview.yml`), config template
(`infra/preview/fly-preview.toml`), and generator
(`infra/preview/make-preview-config.mjs`) are committed, and every CLI invocation
they make was syntax-checked against current tooling (see "Verification status" at
the bottom). But no real preview has been deployed from this environment — there
are no Fly/Neon credentials here. Do not treat the first green run as a formality:
expect the items labeled **unexecuted** below to need one round of fixes.

Every open PR targeting a mainline branch (`main`, `swarm/e2ee-federation-niceties`)
gets a temporary environment:

```text
pull request opened/synchronized/reopened
    |
    Neon branch pr-<N>  (created or reused; 7-day expiry as a fail-safe)
    pnpm db:migrate     (from the runner, against the branch's connection string)
    flyctl deploy       (app patches-pr-<N>: server machine + worker machine)
    |
    PR comment: preview URL + capability matrix   (edited in place, never duplicated)
    |
pull request closed
    |
    flyctl apps destroy patches-pr-<N>   (best-effort, continue-on-error)
    neon branches delete pr-<N>          (best-effort, continue-on-error)
```

Stack: one Fly app (`patches-pr-<N>`, region `iad`) with **both production process
groups** — server (public gRPC + HTTP/Connect) and worker (job loop) — plus one
Neon branch (`pr-<N>`) of the production Neon project. The app is the same Docker
image as production (`infra/docker/Dockerfile`), configured from
`infra/preview/fly-preview.toml` via `make-preview-config.mjs`.

## Design decision: full stack, two machines

Owner direction (2026-08-23): "full preview stack if possible". The default preview
therefore runs **both** `server` and `worker` exactly as production does (same
image, same `[processes]` commands, same graceful-drain semantics), with
`--ha=false` pinning it to exactly one machine per process group.

**Why two machines, not "one machine running both processes":** fly.toml has no
native way to put two process groups on one Machine — the only route is a shell
PID-1 supervisor (`sh -c 'server & worker & wait'`), which (a) does not forward
SIGTERM, so neither process gets its graceful drain (the exact thing
`kill_timeout = 30s` exists for), and (b) coupled with `auto_stop_machines` would
freeze the worker's claim loop whenever the _web_ side is idle — Fly autostops on
proxy traffic, not CPU, so background jobs would stall until the next HTTP request
woke the Machine. A continuously-running worker Machine is the honest floor cost of
a full-stack preview; it is small (`shared-cpu-1x`, 512 MB), single-region, and
destroyed with the app on PR close.

### Reference material: adopted / rejected

- **Fly.io review-apps blueprint** (`fly.io/docs/blueprints/review-apps-guide/`) —
  **adopted**: ephemeral per-PR app from the repo's own image via a committed
  config (their `config:` input mirrors our generated `fly-pr-<N>.toml`); destroy
  on PR close; per-PR concurrency group; small machines; org-scoped token
  (`fly tokens org <org>`) as the recommended `FLY_API_TOKEN` shape. **Rejected**:
  the `superfly/fly-pr-review-apps` action itself — its entrypoint hardcodes a
  single-process app, generates its own app name/URL scheme, and cannot drive our
  Neon-branch + migrations + capability-detection steps; we shell out to flyctl
  directly, which we can syntax-check and reason about. Also not applicable: its
  `fly postgres` attach/detach resource pattern — our database is Neon branches,
  not Fly Postgres.
- **Cloudflare Workers preview URLs**
  (`developers.cloudflare.com/changelog/post/2025-07-23-workers-preview-urls/`) —
  **considered, rejected**: the Patches app runs on Fly Machines, not Workers;
  per-branch preview aliases are a Workers-platform feature with no analogue here.
  (Cloudflare remains in the stack only for R2 media and Pages static sites.)
- **Neon CI preview workflows** (`neon.com/branching/ci-preview-workflows`) —
  **adopted** (confirms the shape already shipped in v1): one branch per preview
  connected to the app preview, schema changes isolated to the branch, delete on
  merge/close, **expiration as automatic cleanup for missed hooks**, compute
  scale-to-zero when idle. Our 7-day `--expires-at` bump-per-deploy is exactly
  their "assign expiration times" pattern.

## Capability matrix

The PR comment always states exactly what is live. There is exactly one
environment-dependent capability (media); everything else is fixed:

| Capability                                                     | State                                            | Why / mechanism                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| gRPC API (`:443`) + HTTP/Connect (`:80`, `:8443`) + `/healthz` | always on                                        | same services as production                                                                                                                                                                                                                                                                                                                                    |
| Worker job loop (notifications, cleanups, media derivatives)   | always on (full stack)                           | `WORKER_ID=preview-pr-<N>`, `WORKER_CONCURRENCY=2` in the shared `[env]`; lease-based reclaim (`WORKER_LEASE_TTL_MS` default 10 min) survives worker restarts                                                                                                                                                                                                  |
| Neon DB branch with migrated schema                            | always on                                        | migrations run on the runner before deploy                                                                                                                                                                                                                                                                                                                     |
| Media / R2 uploads                                             | **on iff all five `R2_PREVIEW_*` secrets exist** | detection step maps them to env and, when complete, sets the app's `R2_*` secrets against a dedicated **preview** bucket (never the production bucket). Missing → cleanly degraded: `R2_*` are optional in `packages/config`'s `storageEnvSchema` and the media module errors at call time, not boot time — uploads fail fast, no derivative jobs are enqueued |
| Federation                                                     | always off                                       | an ephemeral origin makes federation meaningless-to-harmful: no stable identity across re-deploys (throwaway keys), the `patches-pr-<N>.fly.dev` origin appears/vanishes with the PR, and remote peers would accumulate dead inboxes. Enabling would also require a per-deploy `FEDERATION_KEY_ENCRYPTION_KEY` secret for zero value — not worth it            |
| Real email                                                     | always off                                       | `EMAIL_PROVIDER=console`: the worker accepts each message and drops it (in-memory only — the provider deliberately logs only "accepted", never the code). Verification codes / password-reset mails are therefore **unreachable**: sign in with an existing account from the cloned data. No preview can ever send real mail                                   |
| Production secrets                                             | never present                                    | JWT keys + auth-code keyring are throwaway values regenerated by `pnpm keys:generate` on every deploy; existing preview sessions reset on each push                                                                                                                                                                                                            |

Detection mechanism (kept deliberately simple): the workflow cannot run
`gh secret list`, so each optional secret is mapped into the detection step's
`env:` — an empty value means "unset". All five present → media on; any missing →
media off, stated in the PR comment and the job summary. No silent partial config:
it is all-or-none.

## Data warning (read before relying on the default parent)

By default the Neon branch `pr-<N>` is a child of the **project's default branch —
production** (the CLI's `--parent` default; no override is set in the workflow).
That means:

- All production data — posts, profiles, and **server-visible DMs** — is copied into
  the preview, which `PUBLIC_READ=true` then serves to anyone logged out.
- Existing production accounts exist on the preview, password hashes included: a
  user who can log in on production can log in on the preview.

This is the owner's accepted tradeoff for B-105. If it stops being acceptable, set
the repository variable `NEON_PREVIEW_PARENT_BRANCH` to a safer parent (an
anonymized mirror per `docs/research/neon-branching.md`) — the workflow passes it
through as `--parent`. Changing the variable only affects branches created
afterwards.

## Secrets and variables

Set these once (repository secrets, or on a dedicated `preview` environment):

| Name                           | Kind                 | Used for                                                                                                                                                                                              |
| ------------------------------ | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FLY_API_TOKEN`                | secret, **required** | flyctl auth: create/secrets/deploy/destroy the `patches-pr-*` apps. Scope: an **org-scoped token** (`fly tokens org <org>` — the review-apps blueprint's recommendation) rather than a personal token |
| `NEON_API_KEY`                 | secret, **required** | `neon` CLI auth: branch create/set-expiration/delete, connection string. Scope: a **project-scoped org key** limited to the preview project where the plan allows (`docs/research/neon-branching.md`) |
| `NEON_PROJECT_ID`              | secret, **required** | the Neon project previews branch from (`shy-recipe-96135980`, see `docs/operations/deployment.md`)                                                                                                    |
| `R2_PREVIEW_ACCOUNT_ID`        | secret, optional     | media capability — all five R2_PREVIEW_* or none. Credentials scoped to a **dedicated preview bucket**                                                                                                |
| `R2_PREVIEW_ACCESS_KEY_ID`     | secret, optional     | "                                                                                                                                                                                                     |
| `R2_PREVIEW_SECRET_ACCESS_KEY` | secret, optional     | "                                                                                                                                                                                                     |
| `R2_PREVIEW_BUCKET`            | secret, optional     | " (e.g. `patches-media-preview`)                                                                                                                                                                      |
| `R2_PREVIEW_ENDPOINT`          | secret, optional     | " (`https://<account-id>.r2.cloudflarestorage.com`)                                                                                                                                                   |
| `NEON_BRANCH_PASSWORD`         | secret, not read     | manual psql fallback for operators — see below                                                                                                                                                        |
| `NEON_PREVIEW_PARENT_BRANCH`   | variable, optional   | override the branch parent (see data warning above)                                                                                                                                                   |
| `FLY_PREVIEW_ORG`              | variable, optional   | Fly org for preview apps (default `personal`, matching the flagship app)                                                                                                                              |

Why `NEON_BRANCH_PASSWORD` is not needed by the workflow: `neon connection-string`
returns a complete URL **including the branch role's password**, which the Neon API
hands to the CLI (verified in the CLI source: the command calls
`getProjectBranchRolePassword` and embeds the result). This holds even when the
parent is protected and children receive fresh passwords — a fixed secret could not
be relied on there. The value never appears in logs (`::add-mask::` before anything
could print it).

## Cost guards

- **Exactly two machines** (`flyctl deploy --ha=false` + one `[[vm]]` per process
  group): the server machine autostops when idle and wakes on the next request;
  the worker machine runs continuously for the preview's lifetime (see the design
  decision above for why that is the floor cost of full-stack). `--strategy
immediate` replaces machines in place instead of briefly running doubles.
- **Autostop**: `auto_stop_machines = "stop"`, `auto_start_machines = true`,
  `min_machines_running = 0` on both `[[services]]` (server only — the worker has
  no service to be stopped by). Config keys verified against the fly.toml
  reference.
- **Single region**: `iad`, like production.
- **Destroy on close**: the teardown job deletes both the Fly app (machines,
  volumes, certs, the lot) and the Neon branch.
- **Bounded lifetime regardless**: every branch is created with `--expires-at`
  +7 days, and every re-deploy bumps the expiry. A cancelled workflow, a lost
  `closed` event, or a fork PR can therefore never leak a permanent branch. Fly
  apps have no equivalent auto-expiry — the "Orphans" note below is the manual
  backstop.
- Neon compute on the branch suspends after 300 s idle (`--suspend-timeout 300`).

## Manual operations

### Trigger a deploy by hand

Actions tab → **Preview** → **Run workflow** → `pr_number` (the PR must be open).
Useful when only the workflow changed, or a deploy failed transiently. The dispatch
resolves the PR's current head commit itself.

### Manual teardown

```bash
flyctl apps destroy patches-pr-<N> --yes
neon branches delete pr-<N> --project-id "$NEON_PROJECT_ID"   # CLI: neon (npm), alias neonctl
```

(Both verified command shapes: `flyctl apps destroy <name> --yes` per the fly.io
command reference; `neon branches delete <id|name> --project-id` per the installed
CLI 3.6.0. **Unexecuted against a live preview from this environment.**)

### Manual psql access (optional fallback)

`NEON_BRANCH_PASSWORD` exists for this path only:

```bash
psql "postgres://neondb_owner:${NEON_BRANCH_PASSWORD}@<branch-host>/neondb?sslmode=require"
```

`<branch-host>` from `neon connection-string pr-<N> --project-id ...`. If the
branch was created under a protected parent, the password differs from the
parent's — use the value `neon connection-string` prints instead. **Unexecuted.**

## Exact commands the workflow runs

Every command below appears in `.github/workflows/preview.yml`; flag syntax checked
against the installed `neon` CLI 3.6.0 (`--help`), current fly.io docs, and this
repo's own first-deploy transcript (`docs/operations/deployment.md`). Steps marked
**unexecuted** have never run against real infrastructure from this environment.

1. **Neon branch** (**unexecuted**):

   ```bash
   neon branches get pr-<N> --project-id <id> --output json --no-color      # existence probe
   neon branches create --project-id <id> --name pr-<N> \
     [--parent "$NEON_PREVIEW_PARENT_BRANCH"] \
     --expires-at <RFC3339 +7d> --suspend-timeout 300 --output json --no-color
   neon branches set-expiration pr-<N> --project-id <id> --expires-at <RFC3339 +7d>
   ```

   Omitting `--parent` defaults to the project's default branch (production) — the
   data warning above applies.

2. **Connection string** (**unexecuted**): `neon connection-string pr-<N>
--project-id <id> --database-name neondb --role-name neondb_owner`, with the
   `channel_binding=require` parameter stripped (`sed`, same as production — see
   `docs/operations/deployment.md`). Output is masked immediately.

3. **Migrations**: `pnpm db:migrate` with `DATABASE_URL=<branch URL>` and
   `DATABASE_SSL=true` (same pattern as `infra/scripts/neon-dev-branch.sh`, which
   is exercised locally; **the CI-side run is unexecuted**).

4. **Keys**: `pnpm keys:generate`, parsed for `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`,
   `AUTH_CODE_DELIVERY_ACTIVE_KEY_ID`, `AUTH_CODE_DELIVERY_KEYS`.

5. **Fly app** (**unexecuted**): `flyctl apps create patches-pr-<N> --org <org>`
   (org defaults to `personal`, matching the first-deploy transcript's verified
   `flyctl apps create patches-social --org personal`), then

   ```bash
   flyctl secrets set --app patches-pr-<N> DATABASE_URL=… DATABASE_SSL=true \
     JWT_PRIVATE_KEY=… JWT_PUBLIC_KEY=… AUTH_CODE_DELIVERY_ACTIVE_KEY_ID=… AUTH_CODE_DELIVERY_KEYS=… \
     [R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… R2_BUCKET=… R2_ENDPOINT=…]
   ```

   The bracketed `R2_*` group is appended only when the media capability was
   detected (all five `R2_PREVIEW_*` secrets present).

6. **Config + deploy** (**unexecuted**):

   ```bash
   node infra/preview/make-preview-config.mjs --pr <N>     # → infra/preview/fly-pr-<N>.toml
   flyctl deploy --config infra/preview/fly-pr-<N>.toml --remote-only --ha=false \
     --strategy immediate --yes --build-arg PATCHES_BUILD_SHA=<head sha>
   ```

   All flags verified against the current `fly deploy` reference (`--ha`, default
   true; `--strategy immediate`; `--remote-only`; `--yes`). No `release_command`
   runs in the preview config — migrations already ran in step 3. Both process
   groups deploy; `--ha=false` keeps it to one machine each.

7. **PR comment** (**unexecuted**): `gh api` against
   `repos/{owner}/{repo}/issues/<N>/comments` — find a comment containing the
   `<!-- patches-preview: pr-<N> -->` marker, `PATCH` it if present, else `POST`.
   Never duplicates itself. Body carries the capability matrix (media state from
   the detection step).

8. **Teardown** (**unexecuted**): the two manual-teardown commands above, each with
   `continue-on-error: true`, followed by a `$GITHUB_STEP_SUMMARY` report.

## Known gaps

- **Fork PRs**: the deploy job skips them (`head.repo.fork == false` guard) — GitHub
  never exposes the required secrets to fork `pull_request` runs, so a deploy could
  only fail. Teardown still runs best-effort (there is normally nothing to remove).
- **Retargeted PRs**: `edited` is not a trigger; a PR moved away from a mainline
  branch keeps its preview until it closes. Use manual teardown.
- **Racing close**: a `closed` event arriving mid-deploy does not cancel the deploy
  (separate concurrency groups by design); the finished preview is then orphaned
  until manual teardown or the 7-day Neon expiry (Fly side: see "Orphans").
- **Orphans**: `fly apps destroy` failures survive silently (best-effort by design).
  Occasionally list and reap: `flyctl apps list | grep '^patches-pr-'`.
- **Sessions reset per push**: throwaway JWT keys are regenerated every deploy.
- **Worker has no autostop** (by design — see design decision): while a preview is
  open, its worker machine bills continuously. Close PRs promptly; that is the
  intended control.
- **Media capability is set at secret-config time**, not per-run toggling: the
  matrix reflects whatever `R2_PREVIEW_*` secrets exist when the deploy runs.
- **Preview of the preview machinery itself**: changes to `preview.yml` or the
  template only take effect on the _next_ PR event; use `workflow_dispatch` to
  re-run against an open PR.

## Related documents

- `docs/operations/deployment.md` — production deploy, Neon project facts, the
  `channel_binding` strip, `LOG_LEVEL=log` gotcha.
- `docs/research/neon-branching.md` — Neon branch semantics (expiry, protected
  parents, password behavior), GitHub-Actions lifecycle guidance.
- `infra/fly/fly.toml` — the production config the template is derived from.

## Verification status

From this environment (no Fly/Neon credentials), checked directly:

- `node infra/preview/make-preview-config.mjs --pr 123` renders, rejects bad input,
  and leaves no `__PR__` tokens; template and rendered output parse with Python
  `tomllib`.
- `neon` CLI 3.6.0 (`mise exec -- neon … --help`): `branches create` (incl.
  `--parent`, `--expires-at`, `--suspend-timeout`, `--no-compute`), `branches
get/list/delete/set-expiration`, `connection-string` (incl.
  `--database-name`/`--role-name` and its password-fetching behavior, confirmed in
  the installed CLI source).
- fly.io current docs: `fly deploy` flag list (`--ha`, `--strategy immediate`,
  `--remote-only`, `--yes`, `--build-arg`), `fly apps destroy <name> --yes`,
  fly.toml `[[services]]` `auto_stop_machines`/`auto_start_machines`/
  `min_machines_running` semantics, and the review-apps blueprint (reference
  adoptions above).
- Worker env contract read from `apps/worker/src/config/env.schema.ts`:
  `WORKER_ID` (min 1 char, recorded in `outbox_jobs.locked_by`),
  `WORKER_CONCURRENCY` (positive int, default 2), `DATABASE_URL` required,
  `AUTH_CODE_DELIVERY_*` required — both already set app-wide by the workflow.
  Zod strips unknown keys, so worker-only vars in the shared `[env]` cannot break
  the server's schema.
- Console email provider (`apps/worker/src/email/console-email-provider.ts`): logs
  only "email (console provider): accepted" — codes never reach logs.
- Storage gating (`packages/config/src/schemas/storage.ts`): every `R2_*` optional;
  the media module errors at call time when absent — clean degradation confirmed.
- `actionlint` and `prettier --check` pass on the workflow and all new files.

**Unexecuted** anywhere: every step labeled so above — first real run happens on
the first qualifying PR after the secrets exist.

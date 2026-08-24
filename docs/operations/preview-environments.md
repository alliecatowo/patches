# Preview environments (per-PR)

**Status: implemented (B-105), never exercised end to end.** The workflow
(`.github/workflows/preview.yml`), config template (`infra/preview/fly-preview.toml`),
and generator (`infra/preview/make-preview-config.mjs`) are committed, and every CLI
invocation they make was syntax-checked against current tooling (see "Verification
status" at the bottom). But no real preview has been deployed from this environment —
there are no Fly/Neon credentials here. Do not treat the first green run as a
formality: expect the items labeled **unexecuted** below to need one round of fixes.

Every open PR targeting a mainline branch (`main`, `swarm/e2ee-federation-niceties`)
gets a temporary environment:

```text
pull request opened/synchronized/reopened
    |
    Neon branch pr-<N>  (created or reused; 7-day expiry as a fail-safe)
    pnpm db:migrate     (from the runner, against the branch's connection string)
    flyctl deploy       (app patches-pr-<N>, single machine, autostop)
    |
    PR comment: preview URL + Neon branch + commit   (edited in place, never duplicated)
    |
pull request closed
    |
    flyctl apps destroy patches-pr-<N>   (best-effort, continue-on-error)
    neon branches delete pr-<N>          (best-effort, continue-on-error)
```

Stack: one Fly machine (app `patches-pr-<N>`, region `iad`) + one Neon branch
(`pr-<N>`) of the production Neon project. The app is the same Docker image as
production (`infra/docker/Dockerfile`), configured from
`infra/preview/fly-preview.toml` via `make-preview-config.mjs`.

## What a preview includes / excludes

| Present                                                                       | Absent (by design)                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Full gRPC API on `patches-pr-<N>.fly.dev:443` (TLS at Fly's edge, h2c behind) | Federation (`FEDERATION_ENABLED=false` — no webfinger/inbox/outbox surface)                                                                                                                                                                                                    |
| HTTP/Connect edge + `/healthz` on `:80` and `:8443`                           | Media/R2 uploads (no `R2_*` secrets — upload requests fail fast instead of proxying through Node)                                                                                                                                                                              |
| A real schema: migrations run on the branch before deploy                     | Worker process group — **no job processing at all**                                                                                                                                                                                                                            |
| `PUBLIC_READ=true` (logged-out reading, like production)                      | Email delivery: `EMAIL_PROVIDER=console`, and with no worker running, verification codes / password-reset mails are **enqueued but never delivered or printed anywhere**. Sign in with an existing account from the cloned data, or point a local worker at the branch (below) |
| `PASSWORD_AUTH=optional`, `INVITE_ONLY=true` (defaults, set explicitly)       | Custom domain, metrics scraping, log drains                                                                                                                                                                                                                                    |
| Real health check (`/healthz` gates the deploy on `SELECT 1` + gRPC SERVING)  | Production secrets: JWT keys and auth-code keyring are **throwaway values generated per deploy** by `pnpm keys:generate`; each push invalidates existing preview sessions                                                                                                      |

The `.fly.dev` hostname is reachable by anyone who guesses the URL; the PR comment
adds no protection. Treat a preview exactly like the public node it is.

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
anonymized mirror per `docs/research/neon-branching.md`, or create branches with
`--schema-only` semantics via that mirror) — the workflow passes it through as
`--parent`. Changing the variable only affects branches created afterwards.

## Secrets and variables

Set these once (repository secrets, or on a dedicated `preview` environment):

| Name                         | Kind               | Used for                                                                                           |
| ---------------------------- | ------------------ | -------------------------------------------------------------------------------------------------- |
| `FLY_API_TOKEN`              | secret             | flyctl auth: create/secrets/deploy/destroy the `patches-pr-*` apps                                 |
| `NEON_API_KEY`               | secret             | `neon` CLI auth: branch create/set-expiration/delete, connection string                            |
| `NEON_PROJECT_ID`            | secret             | the Neon project previews branch from (`shy-recipe-96135980`, see `docs/operations/deployment.md`) |
| `NEON_BRANCH_PASSWORD`       | secret             | **not read by the workflow** (see note) — manual psql fallback for operators                       |
| `NEON_PREVIEW_PARENT_BRANCH` | variable, optional | override the branch parent (see data warning above)                                                |
| `FLY_PREVIEW_ORG`            | variable, optional | Fly org for preview apps (default `personal`, matching the flagship app)                           |

Why `NEON_BRANCH_PASSWORD` is not needed by the workflow: `neon connection-string`
returns a complete URL **including the branch role's password**, which the Neon API
hands to the CLI (verified in the CLI source: the command calls
`getProjectBranchRolePassword` and embeds the result). This holds even when the
parent is protected and children receive fresh passwords — a fixed secret could not
be relied on there. The value never appears in logs (`::add-mask::` before anything
could print it). Keep the secret only if you want the offline fallback documented
under "Manual psql access" below.

## Cost guards

- **Single machine**: `flyctl deploy --ha=false` + one `[[vm]]` (`shared-cpu-1x`,
  512 MB); `--strategy immediate` replaces it in place instead of running two.
- **Autostop**: `auto_stop_machines = "stop"`, `auto_start_machines = true`,
  `min_machines_running = 0` on both `[[services]]` — the machine stops after a few
  idle minutes and wakes on the next request (sub-second cold start is fine for a
  preview). Config keys verified against the fly.toml reference.
- **Single region**: `iad`, like production.
- **Destroy on close**: the teardown job deletes both the Fly app (machine, volumes,
  certs, the lot) and the Neon branch.
- **Bounded lifetime regardless**: every branch is created with `--expires-at` +7
  days, and every re-deploy bumps the expiry. A cancelled workflow, a lost
  `closed` event, or a fork PR can therefore never leak a permanent branch. Fly
  apps have no equivalent auto-expiry — the runbook's "Orphans" section is the
  manual backstop.
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

### Running a local worker against a preview branch

To exercise registration (which needs code delivery) against a preview branch:

```bash
DATABASE_URL="$(neon connection-string pr-<N> --project-id "$NEON_PROJECT_ID" \
  --database-name neondb --role-name neondb_owner | sed 's/&channel_binding=require//')" \
DATABASE_SSL=true pnpm --filter @patches/worker start
```

(Pattern taken verbatim from `infra/scripts/neon-dev-branch.sh`'s `migrate`
command, which is exercised. **This exact incantation is unexecuted** — the sed
strip is documented in `docs/operations/deployment.md`.)

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
     JWT_PRIVATE_KEY=… JWT_PUBLIC_KEY=… AUTH_CODE_DELIVERY_ACTIVE_KEY_ID=… AUTH_CODE_DELIVERY_KEYS=…
   ```

6. **Config + deploy** (**unexecuted**):

   ```bash
   node infra/preview/make-preview-config.mjs --pr <N>     # → infra/preview/fly-pr-<N>.toml
   flyctl deploy --config infra/preview/fly-pr-<N>.toml --remote-only --ha=false \
     --strategy immediate --yes --build-arg PATCHES_BUILD_SHA=<head sha>
   ```

   All flags verified against the current `fly deploy` reference (`--ha`, default
   true; `--strategy immediate`; `--remote-only`; `--yes`). No `release_command`
   runs in the preview config — migrations already ran in step 3.

7. **PR comment** (**unexecuted**): `gh api` against
   `repos/{owner}/{repo}/issues/<N>/comments` — find a comment containing the
   `<!-- patches-preview: pr-<N> -->` marker, `PATCH` it if present, else `POST`.
   Never duplicates itself.

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
  `min_machines_running` semantics.
- `actionlint` and `prettier --check` pass on the workflow and all new files.

**Unexecuted** anywhere: every step labeled so above — first real run happens on
the first qualifying PR after the secrets exist.

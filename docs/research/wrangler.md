# Wrangler CLI (Cloudflare Pages deployment list/delete) — Reference

Verified 2026-08-26 against the installed `wrangler@4.125.0` devDependency's own bundled
source (`node_modules/wrangler/wrangler-dist/cli.js`, since Cloudflare's hosted docs don't
publish a per-flag JSON schema for this subcommand) plus `wrangler pages deployment list
--help`. Scope: only what `infra/preview/preview-sweep.mjs` (B-154, B-173) needs — listing and
deleting Cloudflare Pages deployments for the preview-teardown sweep.

## `wrangler pages deployment list`

`--help` confirms a `--json` boolean flag (default `false`), not `--format=json` — the ticket's
suggested flag name doesn't exist on this wrangler version. `--project-name <name>` is
required (or falls back to an interactive prompt / `.wrangler` config cache, neither available
in CI).

With `--json`, the command prints (`JSON.stringify(data, null, 2)`) an array of objects shaped
like (from the bundled source, `src/pages/deployments.ts`):

```ts
interface DeploymentListRow {
  Id: string; // deployment.id — the UUID the delete subcommand takes
  Environment: string; // "Production" | "Preview" (title-cased)
  Branch: string; // deployment.deployment_trigger.metadata.branch — exact branch name
  Source: string; // short (7-char) commit SHA
  Deployment: string; // the deployment's public URL
  Status: string; // formatted timestamp on success, else title-cased stage status
  Build: string; // dash.cloudflare.com deep link
}
```

Without `--json`, the same `data` array is rendered as a box-drawing table via
`logger.table()` — this is the sweep's original fragile parse target. `Branch` is the exact
underlying value (not truncated/padded for a table cell), so `--json` output can be
`===`-matched against `pr-<N>` — no substring/regex scraping needed.

Caveats:

- `metadata: { hideGlobalFlags: ["config", "env"] }` and `printBanner: (args) => !args.json`
  mean `--json` also suppresses wrangler's own banner/update-check noise on stdout, so no
  extra stripping is needed before `JSON.parse`.
- Auth failures, missing `--project-name`, and network errors throw before any output — the
  caller sees a non-zero exit and stderr text, not malformed JSON on stdout.

## `wrangler pages deployment delete <id>`

Takes the `Id` field above. `-f`/`--force` (or `-f` per the sweep script) skips the
interactive confirm prompt.

## Verification note

This account has no `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` available in this
environment, so the `--json` output shape above is verified against the CLI's own source that
builds it, not a live API response. If wrangler's Pages API response shape changes upstream,
`deployment.id`/`deployment.deployment_trigger.metadata.branch` could go undefined — the sweep
script should fail loudly (non-zero exit) rather than silently sweep nothing in that case; see
`infra/preview/preview-sweep.mjs`'s validation of each parsed row.

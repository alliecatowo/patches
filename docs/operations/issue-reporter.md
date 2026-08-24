# Beta issue reporter (B-112/B-113)

The TUI (`:report`) and web ("Report an issue") file beta reports against the
**issues-ingest** Cloudflare Worker, which opens labeled GitHub issues on
`alliecatowo/patches` (`label: beta-reporter`). The Worker holds the only GitHub token;
clients never hold write credentials.

## Endpoint

- Deployed default: `https://patches-issues-ingest.alliecatowo.workers.dev/`
- Source: `infra/issues-ingest/src/worker.js` (deployed separately; clients never redeploy it)
- Contract: `POST /` JSON `{ title?, description?, website? (honeypot — leave absent), bundle }`
  → `201 { number, url }`. Body cap 512 KiB. CORS allowlist: `patches-web.pages.dev`,
  `localhost:5173`, `*.fly.dev`.

### Overrides

| Client | Override                            | Default                                                                   |
| ------ | ----------------------------------- | ------------------------------------------------------------------------- |
| TUI    | `PATCHES_REPORT_URL` env            | deployed default constant (`apps/tui/src/diagnostics/report-endpoint.ts`) |
| Web    | `VITE_PATCHES_REPORT_URL` build env | deployed default constant (`apps/web/src/components/IssueReporter.tsx`)   |

Point both at a local Worker dev server (`wrangler dev` in `infra/issues-ingest`) when
testing end to end; remember the origin allowlist above (use localhost:5173 for web).

### Changing the target repo

Repo and credential live in the Worker's bindings (`infra/issues-ingest/wrangler.jsonc`):

- `GITHUB_REPO` var — `owner/name` issues are filed against.
- `ISSUES_GITHUB_TOKEN` secret — must have `issues:write` on that repo
  (`wrangler secret put ISSUES_GITHUB_TOKEN`), then `wrangler deploy`.
- Label applied: `beta-reporter` (create it once in the repo if missing).

## What clients send

The bundle is built exclusively by `@patches/domain`'s `buildDiagnosticsBundle`
(`packages/domain/src/diagnostics.ts`, schema v1) — one redaction path shared by both
clients:

```jsonc
{
  "schemaVersion": 1,
  "app": "tui", // 'tui' | 'web'
  "version": "0.1.0+abc1234",
  "buildSha": "abc1234",
  "nodeDomain": "patches.example:7600", // TUI --target / web location.host
  "sessionHandle": "", // '' unless the reporter opted in
  "capabilities": { "plainMode": true }, // boolean flags incl. vault/E2EE availability
  "breadcrumbs": [
    // newest kept, max 100
    { "at": "2026-08-23T00:00:00Z", "kind": "nav", "detail": "≤200 chars" },
  ],
  "events": [
    // structured log lines, max 100
    { "at": "2026-08-23T00:00:01Z", "message": "rpc listHomeFeed failed: UNAVAILABLE(14)" },
  ],
  "frame": "...", // TUI only: tail of the last rendered frame text
  "screenshotDataUrl": "data:image/png;base64,…", // web only, opt-in, ≤1280w, size-guarded
  "notes": "…",
}
```

Redaction guarantees (§194 discipline, golden-tested):

- RPC failures are recorded as **status-code grade only** (RPC name + Connect code);
  message bodies — including anything DM-derived — have no feeder parameter they could
  enter through.
- Every free-text field is scrubbed for tokens/JWTs/Bearer credentials/provider key
  shapes/private-key blocks/bare 40+-hex runs, plus ANSI/control/bidi stripping
  (`sanitizeText`).
- Post-redaction ceiling 256 KiB: oldest events shed first, then frame, then screenshot,
  then notes truncated.

Fallbacks: TUI writes the bundle JSON to the OS tmpdir and prints the issues URL; web
downloads `patches-report.json`. Both print
`https://github.com/alliecatowo/patches/issues` for manual attach.

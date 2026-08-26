# Beta issue reporter (B-112/B-113)

The TUI (`!` from any screen, or `:report` from the palette) and web ("Report an
issue" chip, mounted once in `RootLayout` so it is persistent on every route) both
build the same redacted diagnostics bundle, but **B-151 made the two clients diverge
in how the bundle leaves the device** — there is no longer one shared delivery path:

| Client | Delivery                                                                                                                                                                                                                                                                                                                   |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TUI    | `POST`s the bundle to the **issues-ingest** Cloudflare Worker, which opens a labeled GitHub issue (see below).                                                                                                                                                                                                             |
| Web    | Local-save only (B-151, `apps/web/src/components/IssueReporter.tsx:162,304-311`) — no network call, no v0 report backend for web (spec §194). Downloads `patches-report.json` to the device and best-effort copies the JSON to the clipboard; the user attaches it manually at the GitHub issues URL printed in the modal. |

Reporting is not reserved for hard failures — bugs, jank and feature ideas all belong
here; the web route error boundary additionally auto-opens the modal (it replaces the
layout, so its instance is the single reporter on screen).

## TUI endpoint

- Deployed default: `https://patches-issues-ingest.alliecatowo.workers.dev/`
- Source: `infra/issues-ingest/src/worker.js` (deployed separately; the TUI never
  redeploys it and holds no write credentials of its own — the Worker holds the only
  GitHub token)
- Contract: `POST /` JSON `{ title?, description?, website? (honeypot — leave absent), bundle }`
  → `201 { number, url }`. Body cap 512 KiB. CORS allowlist: `patches-web.pages.dev`,
  `localhost:5173`, `*.fly.dev` (retained for other future callers of the Worker; the
  web client itself no longer calls it).
- Override: `PATCHES_REPORT_URL` env, default the constant in
  `apps/tui/src/diagnostics/report-endpoint.ts`. Point it at a local Worker dev server
  (`wrangler dev` in `infra/issues-ingest`) to test end to end.

## Web: local save

Web never calls the Worker (there is no `VITE_PATCHES_REPORT_URL` — that override was
removed with the network path). `IssueReporter.tsx`'s `saveReport()` always resolves:
it builds the bundle, triggers a browser download of `patches-report.json`, and races
a best-effort clipboard copy against a deadline so a slow/blocked clipboard can never
hang the flow. Both outcomes point the user at
`https://github.com/alliecatowo/patches/issues` to attach the file (or paste the
clipboard copy) by hand.

### Changing the target repo (TUI path only)

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

### Web breadcrumb persistence (B-162/B-171)

`apps/web/src/lib/diagnosticsReporter.ts` mirrors its in-memory breadcrumb ring to
`sessionStorage` (tab-scoped; key `patches.web.diagnostics-breadcrumbs.v1`) so a reload
before reporting doesn't lose the trail — flushed on `pagehide`, restored on boot.
`sessionStorage` is cleartext, so every breadcrumb `detail` is redacted with
`@patches/domain`'s `redactDiagnosticsText` (the same rules used at bundle-build time)
**before** it enters the ring, not only when a bundle is later built; a stored value is
re-redacted again on restore so a mirror written by an older build can never widen what a
fresh capture would have stored. Bundle-build redaction stays in place on top of this as
defence in depth.

TUI fallback: if the `POST` to the Worker fails, the TUI writes the bundle JSON to the
OS tmpdir instead and prints the issues URL for manual attach — the same shape web
always uses (see "Web: local save" above).

## Web: shake-to-report and its iOS opt-in (B-181)

`useShakeToReport` (`apps/web/src/hooks/useShakeToReport.ts`) listens for `devicemotion`
spikes and routes to `/report`. Android/Chrome fire `devicemotion` with no prompt, so
that path is unchanged. iOS 13+ Safari/PWA gates `devicemotion` behind
`DeviceMotionEvent.requestPermission()`, which **must** be invoked synchronously from a
real user-gesture handler — calling it on mount is silently rejected, which was the bug:
shake-to-report was a no-op on real iPhones with no error at all.

The hook now capability-detects the iOS-only static method (`DeviceMotionEvent` has no
ambient DOM type for it, so a narrow local interface names it instead of reaching for
`any`) and gates the listener on a persisted permission (`unknown` / `granted` /
`denied`, localStorage key `patches.web.shake-report-permission.v1`, synced across tabs
the same way `lib/interfacePreferences.ts` persists other client-only preferences). The
one-time opt-in lives in **Settings → Appearance** (`AppearanceSettingsRoute.tsx`), in a
"Shake to report" section that only renders when the gesture gate exists; its button
calls `requestShakeToReportPermission()` directly from `onClick`.

Honest-UX handling: if permission is denied (or Safari throws because the call didn't
happen inside a gesture), the section says "Shake to report is off" with a plain
explanation and a link to `/report` — never a control that looks live but silently does
nothing. Browsers without the gesture gate (Android, desktop) keep working exactly as
before, with no new prompt and no new UI.

**Status: implemented, unverified on a physical iPhone** — this repo's environment has
no iOS device; the permission-gating logic is covered by jsdom unit tests
(`apps/web/src/hooks/useShakeToReport.test.tsx`,
`apps/web/src/routes/settings/AppearanceSettingsRoute.test.tsx`) that stub
`DeviceMotionEvent.requestPermission`, not by on-device testing.

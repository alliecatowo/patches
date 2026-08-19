# Web (`@patches/web`)

**Status: deployed 2026-08-19, CORS not yet live.** `apps/web/` is a real, text-forward
browser GUI for Patches (spec §0, §154, Amendment B §179 — web is paused as a _general_
client target until board Phase 11, but this scoped GUI gives the node a proper web front
door in the meantime). Vite + React 19, built on the shared `@patches/client` SDK
(ADR 0016 §9 — the same SDK the TUI and, eventually, React Native use). Deployed to
Cloudflare Pages (project `patches-web`) at **https://patches-web.pages.dev**, but the
production node's CORS allow-list hasn't been redeployed to include that origin yet — see
"The CORS coupling" below before assuming the live page actually works end to end.

## What it is

- `apps/web/src/api/client.ts` — builds the Connect transport and the `PatchesApi`
  (`createPatchesApi` from `@patches/client`), plus a single app-level `SessionManager`
  that both an auth-attaching interceptor and every explicit sign-in/out flow read and
  write through (see the file's own comments for why there's deliberately only one).
- `apps/web/src/api/credentialStore.ts` — `localStorage`-backed `CredentialStore`
  (`@patches/client`'s persistence seam), keyed by the node's base URL, holding only the
  access/refresh token pair.
- `apps/web/src/api/session.ts` — a much smaller `localStorage` store than before: just
  the signed-in `Actor`, for synchronous UI reads (`useSession`, nav bar, `ProtectedRoute`).
  Never holds a token.
- `apps/web/src/router.tsx` — every route page is code-split via react-router v7's
  `route.lazy(() => import(...))`, not `React.lazy`/`Suspense` — only the app shell
  (`RootLayout`, `ProtectedRoute`, `NotFoundRoute`) is in the eager entry chunk.
- `apps/web/src/components/ModerationActions.tsx` — block/unblock, mute/unmute, and
  report-with-a-reason UI (`ModerationService`), wired into `ProfileRoute` next to
  `FollowButton`. It shares `FollowButton`'s `['relationship', actorId]` TanStack Query
  cache key, so a block (which also clears any existing follow server-side, spec §62) is
  reflected in both without a second fetch.

See `apps/web/README.md` for the full route list, product rules the UI enforces (strictly
chronological timelines, the mandatory DM disclosure, cosmetics never gating function,
etc.), and keyboard shortcuts.

## Running it

```sh
mise run web                                            # dev server, http://localhost:5173
mise exec -- pnpm --filter @patches/web build            # tsc --noEmit && vite build -> dist/
mise exec -- pnpm --filter @patches/web typecheck
mise exec -- pnpm --filter @patches/web test
mise exec -- pnpm --filter @patches/web lint
```

### Talking to a node in dev

`WEB_ORIGINS` isn't configured for a browser origin against the live node from a plain
dev-server origin either, so dev mode proxies `/api/*` to a real node instead of hitting it
directly from the browser (`vite.config.ts`'s `server.proxy`). Default upstream is the live
node; override with `PATCHES_DEV_UPSTREAM` for a local server:

```sh
PATCHES_DEV_UPSTREAM=http://127.0.0.1:8080 mise run web
```

## Deploying

Deploys go through `wrangler` (Cloudflare's CLI), same pattern as `docs/operations/site.md`.
Authenticated locally via OAuth (`pnpm exec wrangler whoami`) on this machine, or via
`CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` in CI (not wired up yet — there is no
`web.yml` GitHub Actions workflow; every deploy so far has been manual, same caveat as
`site.md`'s and `deployment.md`'s Fly deploy workflow).

The Cloudflare Pages project was created once with:

```sh
pnpm exec wrangler pages project create patches-web --production-branch main
```

Every deploy after that:

```sh
mise run web:deploy
```

which is exactly:

```sh
VITE_PATCHES_API_BASE=https://patches-social.fly.dev:8443 pnpm --filter @patches/web build
pnpm exec wrangler pages deploy apps/web/dist --project-name patches-web --branch main --commit-dirty=true
```

`--branch main` publishes to the production URL; any other `--branch` value gets its own
preview URL (`<hash>.patches-web.pages.dev`) without touching production.

**Live URL: https://patches-web.pages.dev** (first deploy 2026-08-19). `apps/web/public/
_redirects` (`/* /index.html 200`) gives every client-side route a 200 instead of Pages'
default 404 for unknown paths — verified with `curl -sI` against both `/` and a client-only
route (`/@handle`) after the first deploy.

### Why `VITE_PATCHES_API_BASE`, not the dev proxy, in production

In dev, the Vite proxy sidesteps CORS by making every request look same-origin to the
browser. Pages serves only static files — there is no proxy in production — so the
production build talks to the node's real public origin directly
(`VITE_PATCHES_API_BASE=https://patches-social.fly.dev:8443`, baked in at build time,
`apps/web/src/api/client.ts`). That means the request is genuinely cross-origin, which is
where CORS below comes in.

## The CORS coupling

The Connect edge's CORS allow-list (`WEB_ORIGINS`, ADR 0016 §6, `apps/server/src/
transport/connect/cors.ts`) only permits browser origins present in that comma-separated,
bare-origin (`scheme://host[:port]`, no path) list. `infra/fly/fly.toml`'s `[env]` now sets

```
WEB_ORIGINS = "https://patches-web.pages.dev"
```

**but the running `patches-social` Fly app has not been redeployed with this change** —
redeploying the server is out of scope for the change that added this line (see
`docs/operations/deployment.md` for that runbook; someone with Fly access needs to run
`flyctl deploy`). Until that redeploy happens, every cross-origin request from
`https://patches-web.pages.dev` to the live node will fail in the browser with a CORS
error — the page loads (it's static), but every API call after that (login, timelines,
everything) will not. This is expected and not a bug in the web app itself.

If you add a preview-deploy origin (`<hash>.patches-web.pages.dev`) or a custom domain
later, append it to the same comma-separated `WEB_ORIGINS` value and redeploy the server —
Pages preview URLs are not covered by the production entry above.

## Known gaps / follow-ups

Carried over from `apps/web/README.md`, still true after the SDK migration:

- `/c/:id` treats the route param as `Community.id`, not its display name — there is no
  `GetCommunityByName` RPC yet. Either add one, or resolve name→id client-side once
  `ListCommunities` exposes a name filter.
- `PageBlocks` renders `Text`/`Markdown` (as plain text, no Markdown rendering yet)/`Image`/
  `Links`/`Hero`/`NowPlaying`/`AsciiArt`/`Spacer`. `Gallery`/`Friends`/`TopEight`/
  `Guestbook`/`Posts`/`Badges` blocks still show a "not supported here yet" placeholder
  (spec §171 requires a placeholder over a failed page, which this satisfies, but the
  blocks themselves are worth building out).
- Block/mute/report are wired into the profile page only — not into `PostCard` (e.g.
  "report this post" from a timeline) or a dedicated "my blocks/mutes" settings view
  (`ModerationService.ListBlocks`/`ListMutes` are unused so far).
- No CI deploy workflow for `apps/web` yet (unlike `site.yml`'s `workflow_run` +
  `vars.SITE_DEPLOY_ENABLED` gate) — every deploy is `mise run web:deploy` by hand.
- The server's CORS allow-list change hasn't shipped (see above) — the live Pages URL
  cannot successfully call the live node until that redeploy happens.

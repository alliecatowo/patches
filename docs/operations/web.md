# Web (`@patches/web`)

**Status: deployed 2026-08-19, CORS live; hosted build currently stale.** `apps/web/` is a real, text-forward browser GUI
for Patches (spec §0, §154, Amendment B §179 — web is paused as a _general_ client target
until board Phase 11, but this scoped GUI gives the node a proper web front door in the
meantime). Vite + React 19, built on the shared `@patches/client` SDK (ADR 0016 §9 — the
same SDK the TUI and, eventually, React Native use). Deployed to Cloudflare Pages (project
`patches-web`) at **https://patches-web.pages.dev**. Verified 2026-08-19: the production
node's CORS allow-list (`WEB_ORIGINS`) includes that origin —
`curl -sI -H 'Origin: https://patches-web.pages.dev' -X OPTIONS -H 'Access-Control-Request-Method: POST' https://patches-social.fly.dev:8443/patches.v1.SystemService/GetServerInfo`
returns `access-control-allow-origin: https://patches-web.pages.dev` — so the live page can
successfully call the live node end to end.

As observed 2026-08-22, the hosted footer still reports `0.1.0+29df763`. The repository's
newer source fixes below pass locally, but no CI or manual Pages deployment of this revision has
run, so they must not be described as live yet.

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
- `apps/web/src/components/EditWallDialog.tsx` — modal dialog allowing profile owners to
  compose, edit, reorder, and save Page blocks (Text, Markdown, Links, Image) to their profile
  wall (`PageService.UpdatePage`).
- `apps/web/src/components/ActorList.tsx` — actor card list used by `ProfileRoute`'s
  `Followers` and `Following` tabs (which switch via count pills or tab headers).
- `apps/web/src/routes/ThreadRoute.tsx` and `apps/web/src/components/PostCard.tsx` —
  interactive thread view with an inline reply composer below the root post, plus card body
  click navigation to `/p/:id`.
- `apps/web/src/routes/settings/AppearanceSettingsRoute.tsx` — theme selection across the full
  theme catalog with live swatch preview cards, OS-tracking dark/light support, and PWA install prompt.
- `apps/web/src/components/RichBody.tsx` — renders a post body/bio through the shared
  `@patches/markup` grammar to React elements (no `dangerouslySetInnerHTML`); used in
  `PostCard`, `ComposeRoute`'s preview toggle, and `ProfileRoute`'s bio.
- `apps/web/src/routes/settings/*`, `apps/web/src/routes/moderation/ModerationLogRoute.tsx`,
  `apps/web/src/routes/AppealsRoute.tsx` — the Amendment C safety surface (P14-018): privacy
  prefs/export/deletion, personal filters, filter lists, labelers, appearance/theme settings,
  the public moderation log, and appeals — see `apps/web/README.md`'s route list for the full breakdown.

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
Authenticated locally via OAuth (`pnpm exec wrangler whoami`) on this machine, or in CI via a
scoped `CLOUDFLARE_API_TOKEN` secret plus the non-secret `CLOUDFLARE_ACCOUNT_ID` variable.
`.github/workflows/web.yml` now builds the exact `main` commit that passed CI and can deploy it;
the CI deployment remains gated until `WEB_DEPLOY_ENABLED=true` and the token are configured.

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

and the running `patches-social` Fly app has been redeployed with this change — verified
2026-08-19 with the `curl -X OPTIONS` preflight check in the status line above, which
returns `access-control-allow-origin: https://patches-web.pages.dev`. Cross-origin requests
from `https://patches-web.pages.dev` to the live node succeed.

If you add a preview-deploy origin (`<hash>.patches-web.pages.dev`) or a custom domain
later, append it to the same comma-separated `WEB_ORIGINS` value and redeploy the server —
Pages preview URLs are not covered by the production entry above.

## Known gaps / follow-ups

Carried over from `apps/web/README.md` — see that file for the full, current list:

- `/c/:id` treats the route param as `Community.id`, not its display name — there is no
  `GetCommunityByName` RPC yet, and no communities discovery/browse page.
- `PageBlocks` renders `Text`/`Markdown` (as plain text, no Markdown rendering yet)/`Image`/
  `Links`/`Hero`/`NowPlaying`/`AsciiArt`/`Spacer`. `Gallery`/`Friends`/`TopEight`/
  `Guestbook`/`Posts`/`Badges` blocks still show a "not supported here yet" placeholder
  (spec §171 requires a placeholder over a failed page, which this satisfies, but the
  blocks themselves are worth building out).
- Block and mute are wired into the profile page, and post reports can be submitted directly
  from `PostCard`. A dedicated "my blocks/mutes" settings view is still absent
  (`ModerationService.ListBlocks`/`ListMutes` are unused so far).
- `LabelService` has no "list my labeler subscriptions" RPC yet — `/settings/labelers` can
  subscribe/unsubscribe/set-action but can't show current subscription state on load.
- `PinPost` always pins at `position: 0` — no UI yet for managing all three pin slots.
- The new `web.yml` CI deployment path is implemented and its build/action syntax has been
  checked locally, but has not yet performed a real Pages deployment. Manual deploys remain
  available through `mise run web:deploy`.

## Auth, profile diagnostics, and revision identity

The source now persists the protobuf `Actor` through protobuf JSON rather than applying bare
`JSON.stringify` to its bigint-backed `Timestamp`; the regression test round-trips the timestamp
and prevents the former web sign-in exception. `ProfileRoute` distinguishes genuine `NOT_FOUND`
from `SIGN_IN_REQUIRED` and transport failures, offers an actionable sign-in link on a closed
node, and has route tests for each state. The shared client interceptor attaches an available
bearer token to reads, including `GetActorByHandle` when `PUBLIC_READ=false`.

The server build accepts `PATCHES_BUILD_SHA` and exposes `<version>+<short-sha>` through
`GetServerInfo`; the web build already exposes its own version in the footer and boot banner.
These make source/deployment skew diagnosable after the next release. Local verification passed
17 web test files / 66 tests. Live login/profile behavior is still **Status: planned until
B-063 deploys and smoke-tests this revision**.

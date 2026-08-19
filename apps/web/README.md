# @patches/web

A real, text-forward browser GUI for Patches (spec §0, §154, Amendment B §179 — web is paused
as a _general_ client target until board Phase 11, but this scoped GUI exists so the node has
a proper web front door in the meantime). Vite + React 19 + TypeScript 5.9, `react-router-dom`
(data router) for routing, TanStack Query for server state, CSS Modules for styling, Connect
protocol (`@connectrpc/connect` + `@connectrpc/connect-web`) talking directly to the node's
gRPC/Connect edge — no separate backend of its own.

## Product rules this UI enforces

- Every timeline (`/`, `/@handle`, `/t/:tag`, `/c/:id`, search) is strictly chronological. None
  of the list RPCs this client calls take a sort/rank parameter, and a like/bookmark/repost is
  applied optimistically to the post's own counters only — it never reorders or refetches the
  list around it (Amendment B §194).
- Only one reaction exists: the like. There is no upvote/downvote/score anywhere.
- `/messages` and `/messages/:id` always show the mandatory disclosure — "Not end-to-end
  encrypted — this node's operators can read these messages." (`src/components/DmNotice.tsx`,
  Amendment B §183.1). No copy anywhere calls DMs encrypted, secure, or private.
- A profile's nameplate (colour/gradient/glyph) and Page "wall" are cosmetic only — they never
  gate what's clickable or visible (Amendment B §184.3).
- User content is never rendered via `dangerouslySetInnerHTML`. Post bodies are linkified by
  hand (`src/lib/linkify.tsx` — splits on URL/tag regex, builds `<a>`/`<Link>` elements) and
  profile Page walls are rendered through `@patches/domain`'s typed, render-time block parser
  (`src/lib/page.ts`, `src/components/PageBlocks.tsx`) — text, links, and images only.
- Image/media bytes are never proxied through this app: `MediaService.GetMediaDownload` and
  the presigned R2 `BeginMediaUpload` PUT URL are the only paths a browser ever fetches/sends
  media bytes over (spec §101).

## Running it

```sh
mise exec -- pnpm --filter @patches/web dev       # http://localhost:5173
mise exec -- pnpm --filter @patches/web build      # tsc --noEmit && vite build -> dist/
mise exec -- pnpm --filter @patches/web preview
mise exec -- pnpm --filter @patches/web typecheck
mise exec -- pnpm --filter @patches/web lint
mise exec -- pnpm --filter @patches/web test
```

### Talking to a node

The server's `WEB_ORIGINS` CORS allowlist isn't configured for a browser origin yet, so dev
mode proxies `/api/*` to a real node instead of hitting it directly from the browser
(`vite.config.ts`'s `server.proxy`). By default that upstream is the live node,
`https://patches-social.fly.dev:8443`; override it with `PATCHES_DEV_UPSTREAM` for a local
server (`http://127.0.0.1:8080`, the Nest HTTP listener that also serves Connect at
`/patches.v1.*`):

```sh
PATCHES_DEV_UPSTREAM=http://127.0.0.1:8080 mise exec -- pnpm --filter @patches/web dev
```

In production, set `VITE_PATCHES_API_BASE` to the node's real public origin (once `WEB_ORIGINS`
allows it) — the app's own Connect base URL defaults to `/api` (the dev-proxy path) otherwise.

## API layer (`src/api/`)

Kept as a small, self-contained boundary so swapping it for `@patches/client` (the shared SDK
another workstream is building — `createPatchesApi({ transport })`, `SessionManager`,
`describeError`) later only touches these three files, not any route/component:

- `client.ts` — builds the Connect transport (`x-request-id`/`x-patches-client*` headers on
  every call via an interceptor) and exports `api`, one typed client per `patches.v1` service.
  A second interceptor attaches `authorization: Bearer <access>` and, on a single
  `Code.Unauthenticated` failure, rotates the refresh token once (via a _separate_,
  non-authenticated transport, to avoid recursing) and retries the original call once.
- `session.ts` — `localStorage`-backed session store (access/refresh tokens + the signed-in
  `Actor`), subscribable via `useSyncExternalStore` (see `src/hooks/useSession.ts`).
- `errors.ts` — `describeError(error)` maps a thrown `ConnectError` code to user-safe
  title/message/retryable copy for toasts (`src/components/ToastProvider.tsx`).

## Routes shipped

`/` (local timeline, public; home timeline tab when signed in), `/@:handle` (profile: posts +
wall + follow + counts), `/p/:id` (thread: post + one level of replies + "load more"),
`/search` (people via `SearchActors`, posts via `SearchPosts` — both real, not stubbed),
`/notifications`, `/bookmarks`, `/login`, `/register` (invite code required — this node is
invite-only), `/settings/profile` (display name/bio/nameplate), `/compose` (text + up to 4
images with real upload progress + content warning; `?replyTo=<id>` composes a reply),
`/messages` + `/messages/:id` (DM notice always visible), `/c/:id` community feed + join/leave,
`/t/:tag` tag feed. `/*` renders a not-found page; route errors get a boundary.

Keyboard shortcuts mirror the TUI (`apps/tui`): `j`/`k` move focus between posts in a
timeline, `l` likes the focused post, `c` opens compose, `/` opens search, `?` toggles a help
dialog. All are ignored while typing in a form field.

## Known gaps / follow-ups

- `/c/:id` treats the route param as `Community.id`, not its display name — there is no
  `GetCommunityByName` RPC yet. Either add one, or resolve name→id client-side once
  `ListCommunities` exposes a name filter.
- `PageBlocks` renders `Text`/`Markdown` (as plain text, no Markdown rendering yet)/`Image`/
  `Links`/`Hero`/`NowPlaying`/`AsciiArt`/`Spacer`. `Gallery`/`Friends`/`TopEight`/`Guestbook`/
  `Posts`/`Badges` blocks show a visible "not supported here yet" placeholder rather than a
  real render (spec §171 requires a placeholder over failing the page, which this satisfies,
  but the blocks themselves are still worth building out).
- Block/mute actions (`ModerationService`) aren't wired into the profile UI yet — only follow/
  unfollow is.
- No dynamic `import()` code-splitting yet; the production bundle is a single ~600 KB (~178 KB
  gzip) chunk. Fine for v0, worth revisiting before this becomes the primary client surface.

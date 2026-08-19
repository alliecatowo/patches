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
mise run web                                       # dev server, http://localhost:5173
mise exec -- pnpm --filter @patches/web build      # tsc --noEmit && vite build -> dist/
mise exec -- pnpm --filter @patches/web preview
mise exec -- pnpm --filter @patches/web typecheck
mise exec -- pnpm --filter @patches/web lint
mise exec -- pnpm --filter @patches/web test
mise run web:deploy                                # build + deploy to Cloudflare Pages
```

### Talking to a node

The running live node's CORS allow-list hasn't actually been redeployed with a browser
origin yet (see `docs/operations/web.md`'s "CORS coupling" section — `infra/fly/fly.toml`
now sets `WEB_ORIGINS`, but that config change hasn't shipped), so dev mode proxies `/api/*`
to a real node instead of hitting it directly from the browser (`vite.config.ts`'s
`server.proxy`). By default that upstream is the live node,
`https://patches-social.fly.dev:8443`; override it with `PATCHES_DEV_UPSTREAM` for a local
server (`http://127.0.0.1:8080`, the Nest HTTP listener that also serves Connect at
`/patches.v1.*`):

```sh
PATCHES_DEV_UPSTREAM=http://127.0.0.1:8080 mise run web
```

In production (`mise run web:deploy`), `VITE_PATCHES_API_BASE` is set to the node's real
public origin at build time — the app's own Connect base URL defaults to `/api` (the
dev-proxy path) otherwise. See `docs/operations/web.md` for the live URL and deploy
commands.

## API layer (`src/api/`)

Built on `@patches/client` (ADR 0016 §9), the shared SDK this app, the TUI, and (eventually)
React Native all use — `createPatchesApi({ transport })` builds one typed client per
`patches.v1` service (`api.posts`, `api.feeds`, `api.actors`, ... — plural, matching the
SDK's `PatchesApi` interface, not this app's old singular names), `describeError(error)`
maps a thrown `ConnectError` to user-safe copy, and `SessionManager` holds the access/refresh
token pair behind a pluggable `CredentialStore`:

- `client.ts` — builds the Connect transport, a single app-level `SessionManager`, an
  auth-attaching interceptor (`authorization: Bearer <token>` on every non-`AuthService`
  call when signed in, refresh-and-retry-once on `Code.Unauthenticated`), and exports `api`.
  See the file's own comment for why `api.session` (the `SessionManager`
  `createPatchesApi` builds internally) is deliberately never used — only the one
  constructed here is, so there's a single cache over `credentialStore` instead of two
  silently diverging.
- `credentialStore.ts` — `localStorage`-backed `CredentialStore` (the SDK's persistence
  seam), keyed by the node's base URL, holding only `{ accessToken, refreshToken }`.
- `session.ts` — a much smaller `localStorage` store than before this migration: just the
  signed-in `Actor`, for synchronous UI reads (`useSyncExternalStore`, see
  `src/hooks/useSession.ts`). Never holds a token — that's `credentialStore.ts`'s job now.

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
- Block/unblock, mute/unmute, and report (`ModerationService`) are wired into the profile
  page (`src/components/ModerationActions.tsx`, next to `FollowButton`) — not yet into
  `PostCard` (no "report this post" from a timeline) or a dedicated blocks/mutes list view.
- Routes are code-split via react-router v7's `route.lazy()` (`src/router.tsx`) — only the
  shell (`RootLayout`, `ProtectedRoute`, `NotFoundRoute`) is in the eager entry chunk, now
  310 KB raw / 97.68 KB gzip (down from one ~598 KB/178 KB gzip bundle).

See `docs/operations/web.md` for hosting (Cloudflare Pages), the `WEB_ORIGINS` CORS
coupling, and deploy commands.

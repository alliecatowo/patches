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
- User content is never rendered via `dangerouslySetInnerHTML`. Post bodies and profile bios
  render through the shared `@patches/markup` grammar (`src/components/RichBody.tsx` —
  `parseMarkup` → one sanitized AST → React elements), the same parser `apps/tui` layers
  terminal word-wrap on top of, and profile Page walls are rendered through `@patches/domain`'s
  typed, render-time block parser (`src/lib/page.ts`, `src/components/PageBlocks.tsx`) — text,
  links, and images only.
- Amendment C (privacy/filters/decentralized moderation, spec §196–§210): `/settings/privacy`,
  `/settings/filters`, `/settings/lists`, `/settings/labelers`, `/moderation/log`, `/appeals`
  put every safety action the spec requires within reach of the web client (§205). A filtered
  post always shows its provenance ("filtered: `<name>` (via @author)") rather than silently
  changing; `FILTER_ACTION_HIDE` is never something this client has to hide — the server never
  returns that row at all.
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

Dev mode proxies `/api/*` to a real node instead of hitting it directly from the browser
(`vite.config.ts`'s
`server.proxy`). By default that upstream is the live node,
`https://patches-social.fly.dev`; override it with `PATCHES_DEV_UPSTREAM` for a local
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
wall + follow + counts + rich-text bio), `/p/:id` (thread: post + one level of replies + "load
more"), `/search` (people via `SearchActors`; posts via `SearchPosts` with a mode strip and
subtractive `from:handle`/`since:date` query tokens — never a sort/rank param, §194),
`/notifications` (chronological, plus an inline follow-request accept/reject inbox for locked
accounts and moderation notices routed to `/appeals`), `/bookmarks`, `/login`, `/register`
(invite code required, shows this node's privacy notice before submit — §197.1), `/compose`
(text + up to 4 images with real upload progress, content warning, a formatting help line, and
a live preview toggle; `?replyTo=<id>` replies, `?quote=<id>` quotes, `?edit=<id>` edits one of
the caller's own posts in place), `/messages` + `/messages/:id` (DM notice always visible),
`/c/:id` community feed + join/leave, `/t/:tag` tag feed.

`/settings/*` (a shared layout with sub-nav): `appearance` (theme selection across the full theme catalog with live swatches, OS-tracking light/dark modes, and PWA installation prompt), `profile` (display name/bio/nameplate),
`privacy` (notice acknowledgement, discoverable/indexable/local-feed/locked prefs, account
export, account deletion with grace-period copy), `filters` (personal keyword/tag/actor/domain
filters — literal terms only, never a pattern — with JSON export/import), `lists` (browse/
subscribe/unsubscribe public filter lists, per-entry exceptions, publish your own), `labelers`
(subscribe/unsubscribe, per-value action override — see Known gaps for what this screen can't
show yet), `credentials` (passkeys and recovery credentials). `/moderation/log` (this node's public, anonymized moderation log — domain-kind
entries are identified, account/post-kind entries never carry a handle/actor/post ID).
`/appeals` (moderation notices with an appeal form, plus the caller's own appeals and their
status).

`/*` renders a not-found page; route errors get a boundary.

Keyboard shortcuts mirror the TUI (`apps/tui`): `j`/`k` move focus between posts in a
timeline, `l` likes the focused post, `c` opens compose, `/` opens search, `?` toggles a help
dialog. All are ignored while typing in a form field. Every own-post action (edit, delete, pin/
unpin, edit history) lives as a text button in `PostCard`'s action row rather than a shortcut,
since it only applies to a subset of posts. Clicking a post card body or reply button opens its
thread (`/p/:id`), which includes an inline reply composer.

## Known gaps / follow-ups

- `/c/:id` treats the route param as `Community.id`, not its display name — there is no
  `GetCommunityByName` RPC yet. Either add one, or resolve name→id client-side once
  `ListCommunities` exposes a name filter. There is also no communities _discovery/browse_
  page — only the direct `/c/:id` route.
- `PageBlocks` renders `Text`/`Markdown` (as plain text, no Markdown rendering yet)/`Image`/
  `Links`/`Hero`/`NowPlaying`/`AsciiArt`/`Spacer`. `Gallery`/`Friends`/`TopEight`/`Guestbook`/
  `Posts`/`Badges` blocks show a visible "not supported here yet" placeholder rather than a
  real render (spec §171 requires a placeholder over failing the page, which this satisfies,
  but the blocks themselves are still worth building out). Profile wall editing is supported
  via `EditWallDialog` (`+ Edit Wall` on the Wall tab).
- Block/unblock, mute/unmute, and report (`ModerationService`) are wired into the profile
  page (`src/components/ModerationActions.tsx`, next to `FollowButton`) — not yet into
  `PostCard` (no "report this post" from a timeline) or a dedicated blocks/mutes list view.
- `LabelService` has no "list my labeler subscriptions" RPC yet (only `SubscribeLabeler`/
  `UnsubscribeLabeler`/`SetLabelerSubscriptionAction`) — `/settings/labelers` can fire those
  actions but can't show which labelers are currently subscribed on load. Add a
  `ListLabelerSubscriptions` RPC (mirroring `FilterListService.ListFilterListSubscriptions`)
  to close this. (`LabelService`'s `CreateLabeler`/`ApplyLabel`/`RetractLabel`/
  `ListLabelsOnSubject` RPCs are for labeler operators and self-inspection respectively —
  out of scope for this end-user settings screen.)
- `PinPost` always pins at `position: 0` — there's no UI yet for reordering/managing all three
  pin slots (spec §188 allows up to 3).
- Routes are code-split via react-router v7's `route.lazy()` (`src/router.tsx`) — only the
  shell (`RootLayout`, `ProtectedRoute`, `NotFoundRoute`) is in the eager entry chunk.

See `docs/operations/web.md` for hosting (Cloudflare Pages), the `WEB_ORIGINS` CORS
coupling, and deploy commands.

## Which version is deployed?

Three ways, all showing `<package version>+<short git sha>` of the build:

- the page footer (`patches web 0.1.0+abc1234`, hover for the build timestamp);
- the browser console prints `patches web 0.1.0+abc1234 (built …)` once on load;
- devtools: `window.__PATCHES_WEB__` → `{ version, builtAt }`.

The sha is `git rev-parse HEAD` at build time (`CF_PAGES_COMMIT_SHA`/`GITHUB_SHA` win when set by CI).

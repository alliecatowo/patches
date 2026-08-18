# TUI architecture

The primary Patches client. Source of truth: `INITIAL_VISION.md` §67–83, §37.

## 1. Technology (§67)

```text
Ink 7.x
React 19.x
TypeScript
```

`@inkjs/ui` may be used selectively where it fits, but generic components must not
dictate the product's visual identity.

References: https://github.com/vadimdemedes/ink, https://react.dev/

## 2. Feature-based structure (§68)

Organized by feature, not one giant component:

```text
apps/tui/src/
├── app/
│   ├── App.tsx
│   ├── router.ts
│   └── providers/
│
├── screens/
│   ├── HomeScreen.tsx
│   ├── LocalScreen.tsx
│   ├── ThreadScreen.tsx
│   ├── ProfileScreen.tsx
│   ├── NotificationsScreen.tsx
│   ├── SearchScreen.tsx
│   ├── ComposeScreen.tsx
│   └── SettingsScreen.tsx
│
├── components/
│   ├── PostCard.tsx
│   ├── Media.tsx
│   ├── ActorHeader.tsx
│   ├── StatusBar.tsx
│   ├── CommandBar.tsx
│   └── Modal.tsx
│
├── hooks/
├── api/
├── auth/
├── media/
├── state/
├── theme/
└── terminal/
```

Network calls never live directly inside render components — they go through
`api/`/`hooks/`, keeping components focused on presentation.

## 3. Navigation model (§69)

Keyboard-first. Baseline keymap (exact bindings may evolve; keep them discoverable
via `?` help). **Status** marks what actually exists today (`apps/tui/src/app/App.tsx`)
vs. spec-planned:

| Key       | Action                                                        | Status                                                                         |
| --------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `j` / `↓` | next item                                                     | implemented (`PostList`, `SearchScreen`)                                       |
| `k` / `↑` | previous item                                                 | implemented                                                                    |
| `Enter`   | open selected post's thread (or search result's profile)      | implemented (P4-004 — was "open author" before Phase 4)                        |
| `p`       | open selected post's author profile                           | implemented (P4-004; moved off `Enter`)                                        |
| `v`       | reveal/hide a content-warning-gated post                      | implemented                                                                    |
| `c`       | compose                                                       | implemented                                                                    |
| `r`       | reply to selected post (compose, pre-filled `in_reply_to_id`) | implemented (P4-004)                                                           |
| `l`       | like/unlike                                                   | key wired, shows "coming soon" — `ReactionService` not yet in `@patches/proto` |
| `b`       | bookmark/unbookmark                                           | key wired, shows "coming soon" — `ReactionService` not yet in `@patches/proto` |
| `f`       | follow/unfollow the profile being viewed                      | implemented                                                                    |
| `m`       | mute                                                          | planned (Phase 6)                                                              |
| `B`       | block                                                         | planned (Phase 6)                                                              |
| `/`       | search                                                        | implemented                                                                    |
| `g h`     | go home                                                       | implemented (requires a session)                                               |
| `g l`     | go local                                                      | implemented                                                                    |
| `g s`     | go search (alternate to `/`)                                  | implemented                                                                    |
| `g n`     | go notifications                                              | planned (Phase 4) — `NotificationService` not yet in `@patches/proto`          |
| `g b`     | go bookmarks                                                  | planned (Phase 4) — depends on `ReactionService`                               |
| `g p`     | go own profile                                                | implemented                                                                    |
| `R`       | reconnect (connect screen only)                               | implemented                                                                    |
| `?`       | help                                                          | implemented                                                                    |
| `q`       | quit                                                          | implemented                                                                    |
| `Esc`     | cancel modal/action; on the thread screen, back one level     | implemented (login, compose, search, thread)                                   |

## 4. Full-screen behavior (§70)

The TUI uses the terminal alternate screen — it should feel like an application, not
lines dumped into scrollback.

On clean exit:

- restore terminal state,
- restore cursor,
- restore raw mode,
- clean up any inline image placements.

Must be handled without corrupting the user's terminal: `Ctrl+C`, `SIGTERM`,
uncaught errors, terminal resize.

## 5. Example layout (§71)

```text
┌ patches ─────────────────────────────────────────────────────────┐
│ HOME             LOCAL          NOTIFICATIONS           @allison │
├──────────────────────────────────────────────────────────────────┤
│ @alice                                             2 minutes ago │
│                                                                  │
│ Finally finished the ridiculous synth rack.                      │
│                                                                  │
│              ┌────────────────────────────┐                      │
│              │                            │                      │
│              │      terminal image        │                      │
│              │                            │                      │
│              └────────────────────────────┘                      │
│                                                                  │
│ ♥ 12        4 replies                                            │
├──────────────────────────────────────────────────────────────────┤
│ @bob                                              11 minutes ago │
│ bring back personal websites                                     │
│                                                                  │
│    ↳ @charlie: and guestbooks                                    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
 j/k navigate   enter thread   c compose   r reply   ? help
```

Layout is responsive for narrower terminals — 120 columns is never assumed.

## 6. Minimum terminal size (§72)

Default minimum (adjustable):

```text
minimum width: 60 columns
minimum height: 20 rows
```

Below that, the TUI shows a friendly "terminal too small" message instead of
rendering a broken layout.

## 7. Terminal image rendering (§73–76) {#inline-media}

A key differentiator. v0 must support inline images via the **Kitty Graphics
Protocol** where available, without assuming every terminal supports it.

Reference: https://sw.kovidgoyal.net/kitty/graphics-protocol/ ·
Verified research: `docs/research/ink-kitty-graphics.md` ·
Implementation: `packages/terminal-media` (see its `README.md`).

### The seam

Everything media-related lives in `@patches/terminal-media`; the TUI depends on the
interface, never on escape sequences.

```ts
interface TerminalMediaRenderer {
  readonly kind: 'kitty' | 'fallback';
  prepare(
    source: { bytes: Uint8Array; mime: string },
    opts: { maxCols: number; maxRows: number },
  ): Promise<PreparedImage>;
  placeholderRows(img: PreparedImage): string[];
  release(img: PreparedImage): void;
  releaseAll(): void;
}
type PreparedImage = { id: number; cols: number; rows: number; widthPx: number; heightPx: number };
```

Capability detection is a separate, one-shot step (`detectTerminalGraphics()`) rather
than a method on the renderer: it has to run **before** Ink's `render()`, because Ink
takes ownership of stdin and would race the probe's reply. `createRenderer(caps, stdout)`
then picks the implementation once, and nothing downstream branches on terminal
capability again.

Implementations:

```text
KittyGraphicsRenderer   (v0)
FallbackMediaRenderer   (v0)
SixelRenderer           (later)
ITermRenderer           (later)
```

### How the kitty renderer works

Images are **not** drawn as real graphics placements — those are anchored to screen
coordinates and would ghost on every Ink rerender. Instead:

1. `sharp` decodes, auto-orients and downscales the image to fit
   `maxCols × cellWidthPx` by `maxRows × cellHeightPx`, preserving aspect, and
   re-encodes PNG. Cell size comes from `CSI 16 t` during the probe (10×20px assumed
   if unanswered).
2. The PNG is transmitted straight to `process.stdout` as APC escape codes
   (`\x1b_Ga=T,U=1,i=…,f=100,c=…,r=…,q=2,m=…;<base64>\x1b\`), chunked at 4096 base64
   characters, creating an invisible **virtual placement**. This never goes through JSX:
   Ink strips APC sequences inside `<Text>`, and `useStdout().write` repaints the frame.
3. Ink renders the image as _ordinary text_ — a grid of `U+10EEEE` cells whose raw
   24-bit foreground SGR encodes the image id and whose combining diacritics encode each
   cell's row and column. Because they are text, Yoga lays them out, the line differ
   diffs them, scrolling moves them, and clearing the line clears the image.
4. Teardown (`a=d,d=I,i=<id>`) runs from `process.on('exit')` and signal handlers, after
   `unmount()` — Ink 7 discards writes made during alternate-screen teardown, so a React
   effect cleanup would never reach the terminal.

Images are cached by content hash, so re-rendering the same post does not re-transmit;
a resize re-prepares at the new cell budget and releases the previous placement.

### Image-rendering spike (§74)

Before building the full timeline UI, an early spike must prove:

1. Ink full-screen layout works.
2. Kitty graphics can render an image at a controlled position.
3. Image placement survives normal rerenders.
4. Image placements can be removed.
5. Scrolling/selecting posts leaves no ghost images.
6. Terminal resize recovers cleanly.
7. Application exit clears image state.

The spike lives at `packages/terminal-media/spike/`. Run it with
`pnpm --filter @patches/terminal-media spike` (needs a real TTY) or
`… spike -- --report` for a non-interactive capability dump. The manual checklist
mapping each of the seven points to an observation is in
`packages/terminal-media/spike/README.md`.

If raw Kitty protocol integration conflicts with Ink's render model, the
abstraction is solved cleanly — Ink is not replaced merely because the graphics
integration needs low-level escape sequences (§74, §153).

### Fallback (§75)

When no graphics protocol is available:

```text
┌ image · 1600×1067 · jpeg ──────────┐
│ press o to open externally          │
└─────────────────────────────────────┘
```

`FallbackMediaRenderer` produces exactly this box, sized to the available column
budget, from `sharp` metadata alone (no pixel decode). Unicode/chafa-style
approximations may be added later. Sixel is not required for MVP. Terminal fallback
behavior when Kitty is unavailable must never be abandoned (§153).

tmux is treated as **unsupported** unless `allow-passthrough` is actually enabled
(checked by asking tmux, not by guessing), so the fallback box is what tmux users see
by default rather than escape codes leaking into the pane.

### External media opening (§76)

Key `o` opens the selected media via the OS default handler when inline display is
unavailable or a full view is wanted. Uses platform-safe spawning — argument arrays,
never shell string interpolation of untrusted paths.

## 8. Compose experience (§77)

`c` opens compose mode:

```text
┌ New Post ─────────────────────────────────────────┐
│ What's happening?                                │
│                                                  │
│ █                                                │
│                                                  │
│                                                  │
├──────────────────────────────────────────────────┤
│ Attach: none                          143/5000    │
│ ^S post       ^A attach       Esc cancel         │
└──────────────────────────────────────────────────┘
```

Supports: multiline text, image path attachment, optional link detection, alt-text
prompt. An explicit submit key (e.g. `^S`) is required — Enter never silently posts.

## 9. State (§78–80)

**Local state.** No Redux by default — React state, context, and hooks; a small
state library is added only if real complexity demonstrates the need. Server state
is conceptually separated from transient UI state. A lightweight query/cache
abstraction may be built around gRPC calls; React Query is not ported in merely to
have it, unless it meaningfully helps.

**Optimistic UI (§79).** Likes/bookmarks may be optimistic. Post creation visibly
shows a sending state. On mutation failure: revert optimistic state, show an
actionable error, and never lose the user's compose text — network failures must not
eat a draft.

**Draft persistence (§80).** By MVP, unsent compose drafts are persisted locally
(non-sensitive text/media paths only), with `Discard draft?` / `Resume draft?`
prompts.

## 10. Network resilience (§81)

The TUI must gracefully handle, without crashing to a Node stack trace: server
offline, DNS failure, TLS failure, auth expiration, request timeout, temporary gRPC
unavailability, interrupted media upload, and stale media URLs — always with a
useful, actionable message.

## 11. Release packaging (§82)

Goal:

```bash
npm install -g patches
patches
```

Also supported:

```bash
pnpm dlx patches
```

Optional later: Homebrew, standalone Node-packaged binaries, Scoop, winget.
Packaging does not block initial development.

## 12. Credential store (§37)

`CredentialStore` abstraction. Preferred implementation for macOS/Linux/Windows:

```text
@napi-rs/keyring
```

`node-keytar` is explicitly **not** used — its repository is archived.

`@napi-rs/keyring` may not function on every headless/Termux environment, so it must
be imported/used defensively rather than crashing the whole CLI when no platform
credential backend exists.

Fallback behavior when secure storage is unavailable:

- do not persist credentials by default,
- optionally allow an explicitly acknowledged local credential file,
- set restrictive filesystem permissions on that file,
- print a clear warning to the user.

Refresh tokens are never silently stored world-readable.

### SSH credential management (P1-013)

`patches keys add|list|remove` (`apps/tui/src/cli/keys.ts`, logic in
`apps/tui/src/auth/ssh-enroll.ts`) — **Status: implemented**.

- `patches keys add [--ssh-key <path|fingerprint>] [--label <text>] [--yes]`:
  discovers candidates from the agent's loaded identities
  (`SSH_AGENTC_REQUEST_IDENTITIES`), cross-referenced against `~/.ssh/*.pub` for a
  friendlier prompt (`ssh-enroll.ts`'s `discoverEnrollmentCandidates` — the `.pub`
  scan is display-only, never itself enrollable). Requires an explicit `y`
  confirmation (or `--yes` when non-interactive), then asks the agent to sign a
  local nonce (`SSH_AGENTC_SIGN_REQUEST`, never the server's login challenge) as a
  client-side proof the identity is actually loaded, before calling
  `AuthService.AddCredential`. **Never reads a private key file.**
  - Deviation worth flagging: `AddCredentialRequest` (`packages/proto`
    `auth.proto`) carries no signature/challenge field of its own — only the raw
    OpenSSH public key text (`secret`) and a `label` — unlike
    `BeginSshLogin`/`CompleteSshLogin`. The local signature above is therefore a
    client-side guard only, not something the server verifies. A follow-up would
    give `AddCredential` a `BeginSshLogin`-shaped challenge/signature pair so
    possession is attested server-side too.
- `patches keys list` → `AuthService.ListCredentials` (type, label, identifier,
  since-timestamp; never a secret).
- `patches keys remove <fingerprint>` → looks the credential up by
  `identifier` (exact or suffix match, same UX as `--ssh-key`'s picker), then
  `AuthService.RevokeCredential`; the server refuses to revoke an account's last
  remaining credential.
- No in-app (Ink screen) equivalent yet — CLI only. Adding an "account" screen
  that wraps the same `ssh-enroll.ts` logic is a follow-up, not required for
  P1-013's acceptance criteria.

## 13. Screens landed so far (B-015, P2-003, B-016, B-017, P3-003)

`App.tsx` switches between: `help`, `login` (inline, password or SSH-key via
`ssh-login.ts`), `compose`, `profile` (own profile via `g p`, or any actor's — see
"profile targeting" below), `local` (`g l`), `home` (`g h`), and `search` (`/` or
`g s`). The status bar shows `@handle` once signed in.

- **Auth**: `L` opens `LoginScreen`; `Q`/`Esc` cancel (in the password field, only
  `Esc` — a password may legitimately contain `Q`). Reuses `SessionManager` and
  `CredentialStore` from `P1-007` — no parallel session/token logic. An unauthenticated
  `c`/`g p`/`g h` shows a "Log in first" notice instead of the screen.
- **Compose**: `Ctrl+S` is the only submit; `Enter` always inserts a newline. The draft
  (`compose/draft-store.ts`) is lifted into `App` state so it survives switching
  screens, and mirrored to `$XDG_DATA_HOME/patches/compose-draft.json` (falling back to
  `~/.local/share`) so a crash doesn't lose it (spec §80). `CreatePost` carries one
  `client_request_id` for the draft's lifetime, reused on retry (spec §45).
- **Profile / Local / Home feed**: share `components/PostList.tsx` + `PostRow.tsx` and
  the `hooks/usePaginatedPosts.ts` cursor-pagination hook (never offset — spec §46). `n`
  or `space` loads the next page once `page.hasMore` is true, consistently across all
  three. Home (`ListHomeFeed`) requires a session (carries the access token as call
  metadata, like `CreatePost`); Local (`ListLocalFeed`) and a given actor's timeline
  (`ListActorPosts`) are public reads.
- **B-016**: `describeGrpcError(error, target, { context: 'credentials' })` maps
  `UNAUTHENTICATED` from `Login`/`Register` to "Wrong handle/email or password.";
  every other `UNAUTHENTICATED` (an expired session mid-use) keeps "Your session is no
  longer valid." Both the CLI (`login`/`register` commands) and the inline `LoginScreen`
  pass `context: 'credentials'`.

**Profile targeting (B-017)**: `App` tracks an arbitrary `profileTarget` (not just the
caller's own), so `ProfileScreen` works whether or not the viewer is signed in.
`PostList`'s `j`/`k`/arrow keys move a highlighted row; `Enter` opens that post's
author profile, reusing the post's already-embedded `author` (an `Actor` summary)
rather than triggering a `GetActor` round trip. Search results and the compose
screen's "post created" transition go through the same `openProfile`.

**Search (P3-003)**: `/` or `g s` opens `SearchScreen`
(`ActorService.SearchActors` — handle-prefix + display-name match, spec §112).
Typing edits the query; the first `Enter` runs the search, after which `j`/`k`/`Enter`
select and open a result's profile exactly like `PostList`. `Esc` cancels back to the
previous screen.

**Follow control (P3-003)**: `ProfileScreen` shows `following`/`not following` (plus
`follows you` when true) and an `f` toggle whenever the viewer is signed in and
looking at someone else's profile — never on your own. Backed by
`SocialGraphService.GetRelationship`/`FollowActor`/`UnfollowActor`; the relationship
fetch is keyed by `actorId` the same way `useActor`'s "loading" state is (derived, not
written synchronously in the effect — see the code comment for why
`react-hooks/set-state-in-effect` requires that shape).

**Nameplates and content warnings (B-018/B-019)**: `components/Nameplate.tsx` renders
`@handle` styled by `Actor.nameplate` (spec §173) — a colour (or the first stop of a
`"start,end"` gradient; Ink's `<Text>` has no gradient primitive) plus a glyph.
Truecolor→256→16→none degradation is left to Ink/chalk's own `getColorDepth()`/
`NO_COLOR` detection rather than reimplemented client-side. `ProfileScreen` also shows
`nameplate.statusLine` and `nameplate.badges` (`avatarFrame`/`profileBorder` are not
rendered — no text-mode analogue yet). `Post.content_warning` collapses `PostRow`'s
body behind a click-to-reveal banner; `v` on the selected `PostList` row toggles
per-post reveal state (never persisted). `format/sanitize.ts` strips C0/C1 control
characters from every rendered user string (handle, display name, bio, body, content
warning, nameplate glyph) so a hostile value can't smuggle terminal escapes into the
render tree (spec §153/§104) — a spec-required "plain mode that strips all
decoration" toggle is not yet built; tracked as a follow-up.

**Thread screen and reply (P4-004)**: `screens/ThreadScreen.tsx` is `Enter` on any
`PostList` row (home, local, profile, and thread replies themselves — drilling in is
recursive). It fetches the focused post (`PostService.GetPost`) plus, when the post is
itself a reply, its immediate parent for context (one extra `GetPost` — never a walk to
the root; "if cheap" per the task brief). Direct replies come from `ListReplies`, which
the server only ever resolves one level deep (`max_depth` is accepted but not honoured —
see `apps/server/src/modules/posts/post.controller.ts`'s comment on `listReplies`), so
depth is achieved by `App`'s `threadStack` (a stack of post ids) rather than a client-side
recursive fetch: opening a reply's own replies pushes a new `ThreadScreen`; `Esc` pops one
level, only leaving the thread screen once the stack empties (back to whichever screen
`Enter` was pressed from). The focused post and its direct replies share **one**
`PostList` (`rowIndent` gives the focused post depth 0 and replies depth 1) rather than a
separate always-on "reply to the focused post" hotkey — this is what lets `j`/`k`/`r`/`p`/
`l`/`b` all operate unambiguously on whichever row is selected, focused post included.

`components/PostList.tsx`'s five per-row actions (`PostRowActions`, one shared prop object
every list-rendering screen accepts as `actions`) replaced the single `onOpenAuthor`
Enter-only path: `Enter` → `onOpenPost` (opens the thread), `p` → `onOpenAuthor` (moved off
`Enter`), `r` → `onReply` (opens `ComposeScreen` scoped to that post), `l`/`b` →
`onToggleLike`/`onToggleBookmark`. A reply draft is fresh per target
(`compose/draft-store.ts`'s `ComposeDraft.inReplyToId`/`replyingToHandle`) — switching
which post you're replying to never carries over another reply's half-typed text;
`ComposeScreen` shows a "replying to @handle" header and passes `in_reply_to_id` through
to `CreatePost`. Posting a reply jumps straight to its own thread (parent shown above for
context) rather than the author's timeline.

Because `g`'s single-letter follow-ups (`p`/`l`/`h`/`s`/…) and the row-level shortcuts
share letters (`l` is both "go local" after `g` and "like" on a row — this overlap already
exists in the spec's own baseline keymap), every list-rendering screen's `isActive` is
ANDed with `!pendingGo` so a row action never double-fires during the ~600ms window after
pressing `g`.

`l`/`b` (`onToggleLike`/`onToggleBookmark` in `App.tsx`) are wired to the key but currently
show a "coming soon" notice — `ReactionService` (`LikePost`/`UnlikePost`/`BookmarkPost`/
`UnbookmarkPost`) had not landed in `@patches/proto` as of this change (spec §53). Swapping
the placeholder for real optimistic calls (same pattern as `ProfileScreen`'s
`toggleFollow`) is a follow-up once the service exists, along with the bookmarks list
(`g b`) and the notifications screen (`g n`, spec §56) — see the implementer report.

## 14. Testing (B-015)

`apps/tui/test/harness.tsx` exports `renderApp(options)`, which renders the real `App`
against `apps/tui/test/fake-api.ts` — an in-memory `PatchesApi` (users, sessions,
posts) — instead of a live gRPC server:

```ts
const { press, lastFrame, unmount } = renderApp({ fakeOptions: { pageSize: 2 } });
await flush();
press('?');
```

`renderApp` returns ink-testing-library's normal `{ lastFrame, frames, stdin, unmount }`
plus `fake` (the seeded `FakeApiHandle` — `addUser`/`addPost`) and `press` (an alias for
`stdin.write`). `KEY` exports the raw byte sequences for non-printable keys (`enter`,
`escape`, `backspace`, `ctrlS`).

Test files matching `test/**/*.test.tsx` run alongside `src/**/*.test.{ts,tsx}` (see
`vitest.config.ts`) — `pnpm --filter @patches/tui test` runs both, no separate command.
`connect.test.tsx` and `help.test.tsx` cover the connect/offline/retry and help-toggle
paths against the harness; `screens.test.tsx`/`social.test.tsx` cover login, compose,
profile, local-feed pagination, home feed, search, and follow/unfollow; `thread.test.tsx`
(P4-004) covers opening a thread, the reply flow, and drill-down/`Esc`-back navigation.
`test/fake-api.ts`'s `addPost(authorId, body, createdAt?, inReplyToId?)` seeds a reply
directly, and it now implements `GetPost`/`ListReplies` (direct replies only, newest
first — same shape as the real `PostService.listReplies`) alongside the feed RPCs it
already faked.

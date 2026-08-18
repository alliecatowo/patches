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
via `?` help):

| Key       | Action                          |
| --------- | ------------------------------- |
| `j` / `↓` | next item                       |
| `k` / `↑` | previous item                   |
| `Enter`   | open selected post/thread       |
| `c`       | compose                         |
| `r`       | reply                           |
| `l`       | like/unlike                     |
| `b`       | bookmark/unbookmark             |
| `f`       | follow/unfollow selected actor  |
| `m`       | mute                            |
| `B`       | block                           |
| `/`       | search                          |
| `g h`     | go home                         |
| `g l`     | go local                        |
| `g n`     | go notifications                |
| `g p`     | go own profile                  |
| `R`       | refresh                         |
| `?`       | help                            |
| `q`       | back / quit (context-dependent) |
| `Esc`     | cancel modal/action             |

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

## 13. Screens landed so far (B-015, P2-003, B-016)

Beyond the connect screen, `App.tsx` now switches between: `help`, `login` (inline,
password or SSH-key via `ssh-login.ts`), `compose`, `profile` (own profile via `g p`;
generic over any `actorId`), `local` (`g l`), and `home` (`g h` — placeholder until
Phase 3's fan-out feed). The status bar shows `@handle` once signed in.

- **Auth**: `L` opens `LoginScreen`; `Q`/`Esc` cancel (in the password field, only
  `Esc` — a password may legitimately contain `Q`). Reuses `SessionManager` and
  `CredentialStore` from `P1-007` — no parallel session/token logic. An unauthenticated
  `c`/`g p` shows a "Log in first" notice instead of the screen.
- **Compose**: `Ctrl+S` is the only submit; `Enter` always inserts a newline. The draft
  (`compose/draft-store.ts`) is lifted into `App` state so it survives switching
  screens, and mirrored to `$XDG_DATA_HOME/patches/compose-draft.json` (falling back to
  `~/.local/share`) so a crash doesn't lose it (spec §80). `CreatePost` carries one
  `client_request_id` for the draft's lifetime, reused on retry (spec §45).
- **Profile / Local feed**: share `components/PostList.tsx` + `PostRow.tsx` and the
  `hooks/usePaginatedPosts.ts` cursor-pagination hook (never offset — spec §46). `n` or
  `space` loads the next page once `page.hasMore` is true.
- **B-016**: `describeGrpcError(error, target, { context: 'credentials' })` maps
  `UNAUTHENTICATED` from `Login`/`Register` to "Wrong handle/email or password.";
  every other `UNAUTHENTICATED` (an expired session mid-use) keeps "Your session is no
  longer valid." Both the CLI (`login`/`register` commands) and the inline `LoginScreen`
  pass `context: 'credentials'`.

Known gaps, tracked as follow-ups rather than blocking this slice:

- `Post`/`Actor` have no `content_warning`/`nameplate` field yet in `packages/proto`
  (nameplates are Amendment A, §173) — `PostRow`/`ProfileScreen` render everything else
  and will pick these up once the schema has them.
- Viewing another actor's profile "from a post" (vs. the caller's own via `g p`) isn't
  wired yet — `ProfileScreen` already takes an arbitrary `actorId`, but no screen has a
  selectable post list to launch it from.

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
paths against the harness. Extending coverage to the login/compose/profile/local-feed
flows (all wired and typechecked, but not yet snapshot-tested) is a follow-up — the
harness and fake API already support it; see the implementer report on the change that
added them.

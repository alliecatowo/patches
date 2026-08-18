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

| Key | Action |
|---|---|
| `j` / `↓` | next item |
| `k` / `↑` | previous item |
| `Enter` | open selected post/thread |
| `c` | compose |
| `r` | reply |
| `l` | like/unlike |
| `b` | bookmark/unbookmark |
| `f` | follow/unfollow selected actor |
| `m` | mute |
| `B` | block |
| `/` | search |
| `g h` | go home |
| `g l` | go local |
| `g n` | go notifications |
| `g p` | go own profile |
| `R` | refresh |
| `?` | help |
| `q` | back / quit (context-dependent) |
| `Esc` | cancel modal/action |

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

## 7. Terminal image rendering (§73–76)

A key differentiator. v0 must support inline images via the **Kitty Graphics
Protocol** where available, without assuming every terminal supports it.

Reference: https://sw.kovidgoyal.net/kitty/graphics-protocol/

```ts
interface TerminalMediaRenderer {
  detect(): Promise<boolean>;
  render(...): Promise<...>;
  clear(...): Promise<void>;
}
```

Implementations:

```text
KittyGraphicsRenderer   (v0)
FallbackMediaRenderer   (v0)
SixelRenderer           (later)
ITermRenderer           (later)
```

### Image-rendering spike (§74)

Before building the full timeline UI, an early spike must prove:

1. Ink full-screen layout works.
2. Kitty graphics can render an image at a controlled position.
3. Image placement survives normal rerenders.
4. Image placements can be removed.
5. Scrolling/selecting posts leaves no ghost images.
6. Terminal resize recovers cleanly.
7. Application exit clears image state.

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

Unicode/chafa-style approximations may be added later. Sixel is not required for
MVP. Terminal fallback behavior when Kitty is unavailable must never be abandoned
(§153).

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

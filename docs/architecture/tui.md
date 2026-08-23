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
│   ├── ActorListScreen.tsx
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
├── pages/
├── state/
├── theme/
└── terminal/
```

Network calls never live directly inside render components — they go through
`api/`/`hooks/`, keeping components focused on presentation.

## 3. Navigation model (§69)

Keyboard-first. **`apps/tui/src/app/keymap.ts` is the single source of truth** — one
`KEYMAP` table that generates the status-bar hints, the `?` help screen, and the
command palette, so those three can never disagree about what a key does. Do not
copy the bindings into a third place; a duplicated table is a table that drifts (this
section used to hold one, and it went stale the moment keymap v2 landed).

- Reader-facing table: [`docs/user-guide.md`](../user-guide.md), checked against
  `KEYMAP` by `apps/tui/test/docs-keymap.test.ts`.
- In-app: press `?` for the complete list, grouped, with the current screen's keys
  first. `j`/`k` scrolls it a line at a time and `Space`/`PgDn` a page at a time.
- By name: `:` or `Ctrl+P` opens the command palette, whose commands are generated
  from the same table.

### Keymap v2 (P12-007) — what changed

| Key          | Now                                 | Previously                              |
| ------------ | ----------------------------------- | --------------------------------------- |
| `R`          | repost / unrepost the selected post | reconnect (the connect screen is gone)  |
| `Ctrl+R`     | refresh the current screen          | —                                       |
| `Q`          | quote the selected post             | —                                       |
| `J`          | join / leave the community          | —                                       |
| `E`          | edit your own selected post         | (still edits a Page on the Page screen) |
| `d`          | delete your own post (confirm)      | —                                       |
| `H`          | the selected post's edit history    | —                                       |
| `: / Ctrl+P` | command palette                     | —                                       |

### Input dispatch

Every key goes through one dispatcher (`app/input.tsx`). Screens and overlays push a
_layer_; the shell dispatches top-down and a layer returns `true` only for keys it
actually consumed, so `Ctrl+C`, `Ctrl+P` and the navigation prefix stay reachable from
inside a text sub-mode. Two hazards this design has already hit, both worth knowing
before touching it:

- **Ink parses one stdin chunk into one keypress.** Two keys typed fast enough to
  arrive in the same read reach the app as a single multi-character `input`, so a
  two-key sequence like `g h` is never seen. The shell splits such runs back into
  individual keys (`isCoalescedKeyRun`); without it, the faster you type the less
  works.
- **Prefix state is held in a ref, not `useState`.** Ink invokes the same handler
  closure for every key in a chunk, so a state value written by one key is still stale
  when the next is handled in the same tick.

### Overlays

An open overlay (help, palette, confirm) hides the screen beneath it with
`display="none"`, never with `height={0}`: a zero-height box is removed from layout
but Ink still paints its text into the same rows, which showed the timeline bleeding
through the help screen mid-line. `display="none"` makes Yoga skip the subtree and Ink
skip painting it, while React keeps the screen mounted so an in-progress sub-mode (a
half-typed guestbook entry) survives opening the palette. True frozen-background
compositing is still open as P12-022.

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

**Status: implemented (P5-003, B-004).** `apps/tui/src/media/`:

- `validate.ts`'s `readLocalImage` sniffs the real format from magic bytes (never the
  filename extension or a claimed MIME type — spec §31), enforces the spec §28 10 MB
  ceiling (`@patches/terminal-media`'s `MAX_INPUT_BYTES`, shared so the two limits can't
  drift), and computes the SHA-256 the worker verifies.
- `upload.ts`'s `uploadMediaFile` does `BeginMediaUpload` → a chunked `PUT` straight to
  the presigned URL (never proxied through Node — spec §30) → `FinalizeMediaUpload`, then
  `pollUntilReady` polls `GetMediaDownload` until the worker (P5-002) reports `READY`/
  `FAILED` or a timeout elapses.
- `cache.ts`'s `MediaCache` is a bounded on-disk LRU (`$XDG_CACHE_HOME/patches/media`,
  100 MB default, evicted by file mtime) — spec §32's "do not allow unlimited disk
  growth," one shared instance for the whole app (`App.tsx`'s `MediaSessionProvider`).
- `open-external.ts`'s `openMediaExternally` downloads the display derivative into that
  cache and spawns the OS opener (`open`/`xdg-open`/`cmd /c start`) with the cached file's
  real path — an image viewer opens it, not a browser guessing from a bare URL.
  `PATCHES_NO_OPEN=1` is a no-op escape hatch for headless/CI shells and tests.
- `components/MediaAttachments.tsx` renders every attachment on a `Post` (and, via the
  same component, a Page `Image`/`Gallery` block — see `docs/architecture/pages.md` §6):
  a Kitty `InlineImage` when the terminal, a `MediaSession`, and plain mode all agree it
  can, otherwise the spec §75 fallback box (`buildFallbackBox` — mime/dimensions/`press o
to open externally`). `PostRow` always renders it; there is no path where an attachment
  is silently dropped.

### Render mode precedence (P12-113)

`createRenderer`'s `mode` (`auto`/`kitty`/`pixel`/`ascii`/`box`/`off`) is picked once,
in `cli.tsx`, before Ink's `render()`: `PATCHES_IMAGES` env var > the saved
per-node/actor `imagePolicy` preference (`preferences/store.ts`) > `'auto'` —
`media/image-mode.ts`'s `resolveEffectiveImageRenderMode`. The saved preference is read
via a local-only `credentialStore.get()` lookup (no network — it does not duplicate
`SessionManager.restore()`'s refresh-token exchange just to learn the actor id).

`PreferencesScreen`'s "Images" row edits `imagePolicy` (lifted into `App.tsx` state
alongside theme/plain/quiet) but does **not** apply live: swapping the renderer's kind
mid-session would need safely tearing down any in-flight Kitty placements first, which
is out of scope. Saving a changed value toasts "restart patches to apply" instead.

## 7b. Post body markup (P12-017) {#markup}

A post body is displayed as rich text. Two input dialects are accepted and both are
funnelled through **one** pipeline in `apps/tui/src/format/markup.ts`:

```
raw body -> sanitizeForTerminal -> parse (markdown | HTML subset) -> AST -> layout -> Ink
```

- **Markdown-lite**: `**bold**`, `*italic*`, `` `code` ``, fenced code, `[text](url)`,
  bare URLs, `- `/`1. ` lists, `> ` blockquote, `#` headings (rendered as bold — a
  terminal has no larger type to grow into), plus `@mentions` and `#tags`.
- **HTML subset**: `<b> <strong> <i> <em> <code> <a href> <br> <p> <ul> <ol> <li>
  <blockquote>`. Every other tag is stripped to its text; `<script>`/`<style>` lose
  their contents entirely.

### Invariants

1. **Sanitisation happens once, first.** Control characters and escape sequences never
   reach the AST, and a numeric entity (`&#27;`) cannot smuggle one back in.
2. **Only http/https/mailto are links.** `javascript:` and `data:` render as inert
   text, never as something activatable.
3. **Layout is measurement.** `layoutMarkup` wraps to exact terminal cells and
   `measureMarkupHeight` counts the lines it produced, so the viewport's height and the
   drawn output are the same computation rather than two that must be kept in step.
   `measurePostBody` measures in _plain_ mode, which reproduces the source markers and
   is therefore an upper bound on the decorated form.
4. **A newline is a line break.** A paragraph holds hard-broken lines; markdown's
   "soft break becomes a space" rule would reflow every multi-line post into a wall of
   text.
5. **Plain mode shows the source markers** (`**bold**`, `[text](href)`, `- item`,
   `> quote`) with no colour, so emphasis stays visible with all decoration off
   (§173/§185).

### The web client must reuse this grammar

`markup.ts` contains no Ink, React or terminal escapes — it takes a string and returns
data. When the web client renders post bodies it **ports or imports this module**
rather than growing a second grammar. Two grammars means the same post renders
differently in two clients, and a sanitiser bug fixed in one survives in the other;
the safe-scheme allow-list and the escape stripping in particular are security
behaviour, not formatting. If the module needs to move, promote it to a shared package
(`packages/domain` or a new `packages/markup`) — do not fork it.

## 7c. Theme engine and user configuration (P12-101/103/113/117/127, B-047)

`theme/` (`theme/index.ts`, `theme/themes/*`, `theme/glyphs.ts`, `theme/color.ts`,
`theme/plain-mode.tsx`) and `preferences/store.ts` together implement themes and persisted
per-account configuration. `Status: implemented.`

### Themes

Six built-ins (`theme/themes/registry.ts`): `patches`, `paper`, `mono` (zero colour codes at
all — design vision §4.1's "no colour: bold/dim/inverse only"), `hacker`, `pastel`, and
`terminal` (`backgroundMode: 'terminal'`, delegates every token to the user's own palette). Each
defines all 13 `SemanticColorToken`s (`theme/themes/types.ts`) plus a `preferredGlyphSet` and
`backgroundMode`; `theme/themes/registry.ts`'s `validateThemeContrast` enforces the WCAG AA
4.5:1 floor for every theme at build/test time, not just at authoring time.

A user can also drop a JSON theme at `$XDG_CONFIG_HOME/patches/themes/<name>.json` (default
`~/.config/patches/themes/<name>.json`, `theme/themes/load.ts` + `schema.ts`) — every one of the
13 tokens is required (a theme that silently omits one is exactly the "quietly unreadable on
some background" bug the validation exists to catch), each value a 6-digit hex colour or `null`
(delegate to the terminal). An invalid file never crashes the app: `resolveThemeWithUserThemes`
falls back to `patches` and returns a message the shell toasts once.

Precedence (`theme/themes/resolution.ts`'s `resolveTheme`/`resolveThemeWithUserThemes`, pure and
unit-tested independent of disk/env access): `--theme` > `PATCHES_THEME` > the saved local
per-node+per-actor preference > `patches`. `App.tsx` resolves this once at mount from
`PATCHES_THEME`, then again once the signed-in account's saved preference loads
(`preferences.get`) — an env/CLI value never gets silently overridden by a saved one. The `,`
Preferences screen's Theme row applies a preview live (`setActiveTheme`/`onPreviewTheme`) before
the viewer commits; `Esc` reverts to whatever was active when the screen opened.

**Colour degradation is Ink/chalk's job, not this engine's.** Every theme token is authored as a
plain 6-digit hex string (or `null`); passing that straight to `<Text color>`/`<Box
borderColor>` already downsamples truecolor → 256-colour → 16-colour → no colour based on what
the terminal reports, and chalk (which Ink uses internally) honours `NO_COLOR`/`TERM=dumb`
itself — nothing in `theme/` needs to special-case either. `theme/color.ts`'s explicit
`resolveTerminalColor`/`terminalContrastRatio` (`TerminalColorTier`: `truecolor`/`ansi256`/
`ansi16`/`text`) exist for the one place a tier must be _chosen and previewed on purpose_ rather
than left to the terminal: `ColorPicker`'s swatch preview when picking a custom nameplate
colour, so what you see while picking a colour is what you'll actually get.

### Glyph sets (P12-103)

`theme/glyphs.ts`'s `resolveGlyphSet({ envGlyphSet, preferredGlyphSet, locale })`: `PATCHES_GLYPHS`
env > saved preference > auto (`unicode` unless the locale isn't UTF-8, in which case `ascii`).
`nerd` (Nerd Font glyphs) is never auto-selected — opt-in only, per design vision §3.5. No control
in the app is glyph-only: every glyph has a word alongside it or an ASCII-safe equivalent.
`App.tsx` resolves this once at mount (`env.PATCHES_GLYPHS`/locale), reconciles it against the
saved preference the same way theme/plain/linear are, and threads the result to `MessagesScreen`
(currently the one glyph-rendering call site) — the Preferences screen's Glyphs row previews
live and round-trips through this same state and the persisted `glyphSet` preference field.

### Persisted configuration

`preferences/store.ts`'s `FilePreferenceStore` persists `LocalPreferences` (theme, plain mode,
quiet feed, glyph set, image policy, linear mode) to
`$XDG_CONFIG_HOME/patches/preferences.json` (`~/.config/patches/preferences.json` by default),
keyed per `(nodeOrigin, actorId)` — one file can hold preferences for several accounts/nodes
without them clobbering each other. Writes are atomic (temp file + `rename`, `0600`/`0700`
modes) and the whole document is schema-and-shape-validated on read
(`isStoredEntry`/`isLocalPreferences`); a missing, corrupt, or partially-invalid file is treated
as "no saved preferences" — the app falls back to CLI/env/auto defaults and keeps going, never
throws. `MemoryPreferenceStore` is the equivalent for tests. Signed-out sessions never persist —
`,`'s Enter shows "Preferences apply for this session — sign in to save them" instead of writing
anything.

The `,` Preferences screen is the interactive editor for this file; there is no separate raw-JSON
editing UI by design (`theme/themes/*.json` files under `themes/` are the one place a user hand-
authors JSON, for a custom theme — the top-level `preferences.json` itself is app-managed).

## 8. Compose experience (§77)

`c` opens compose mode:

```text
┌ New Post ─────────────────────────────────────────┐
│ What's happening?                                │
│                                                  │
│ █                                                │
│                                                  │
│ [1] photo.png                                    │
├──────────────────────────────────────────────────┤
│                                        143/5000    │
│ ^S post  ^A attach  ^X remove last  Esc keep draft │
└──────────────────────────────────────────────────┘
```

Supports: multiline text, up to 4 image attachments by local file path (spec §28), an
inline upload-progress line while one is in flight. An explicit submit key (`Ctrl+S`) is
required — Enter never silently posts. `Ctrl+A` prompts for a path; the attach flow does
its own validate → upload → poll-until-`READY` round trip
(`media/validate.ts`/`media/upload.ts`) before adding the id to the draft, so a post is
never created referencing a still-processing or failed upload. Not implemented: link
auto-detection from body text, and a per-attachment alt-text prompt — both are
follow-ups, not a silent gap (alt text has no UI to set it yet on either `CreatePost` or
`Post.media`).

Each attachment also gets a small (≤6 rows, ≤24 cols) terminal-art thumbnail via
`@patches/terminal-media`'s `renderArtPreview`, fired once as a best-effort side effect
right after that attach succeeds (a session-local render cache keyed by `mediaId`, not
part of the persisted draft). Skipped in plain mode and when the session has no media
renderer or it resolved to the `box` fallback.

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
  confirmation (or `--yes` when non-interactive), then runs a **server-verified**
  possession proof (B-021): `AuthService.BeginSshEnrollment(public_key_openssh)`
  issues a single-use, TTL ≤ 120 s challenge bound to the caller's own account and
  that key's fingerprint; the agent signs the enroll-domain blob
  (`SSH_AGENTC_SIGN_REQUEST`, never a private key); `AddCredential(SSH_PUBLIC_KEY)`
  carries the resulting `ssh_proof: {challenge_id, signature, signature_format}`,
  which the server verifies with the same signature verifier login uses (SHA-1
  `ssh-rsa` and sub-2048-bit RSA rejected identically) before enrolling the key.
  **Never reads a private key file.** See `docs/architecture/auth.md`'s
  "Enrollment" subsection for the full protocol and its one documented storage
  deviation (the binding is JSON-encoded into an existing text column rather than
  a dedicated schema field, since a schema change was outside this change's scope).
- `patches keys list` → `AuthService.ListCredentials` (type, label, identifier,
  since-timestamp; never a secret).
- `patches keys remove <fingerprint>` → looks the credential up by
  `identifier` (exact or suffix match, same UX as `--ssh-key`'s picker), then
  `AuthService.RevokeCredential`; the server refuses to revoke an account's last
  remaining credential.
- **In-app equivalent (B-022)**: `L` when already signed in opens
  `screens/AccountsScreen.tsx` — lists credentials (`AuthService.ListCredentials`),
  `a` enrolls an SSH key already loaded in the agent (same `discoverEnrollmentCandidates`/
  `enrollSshCredential` as `cli/keys.ts runKeysAdd` — never reads a private key), `x`
  signs out (`SessionManager.logout()`). No in-app credential _removal_ yet (`patches
keys remove` stays CLI-only) — tracked as a follow-up.

### Email verification (A-028)

`patches verify <code>|--resend` (`apps/tui/src/cli/verify.ts`) — **Status: implemented**.

- `patches verify <code>` → unauthenticated `AuthService.VerifyEmail({ code })` (the
  code from the verification email is itself the proof — spec §37/§165, same reasoning
  as `VerifyEmailRequest` carrying no session). Prints `Email verified.` on success, an
  error otherwise — never a raw gRPC status.
- `patches verify --resend` → requires an existing session (`patches login` first);
  resolves it via `SessionManager.restore()`/`ensureAccessToken()`, then
  `AuthService.ResendVerification({})`. Prints `Verification email sent.`.
- There is deliberately no in-app code-entry flow — entering an emailed code is a CLI
  job. `screens/AccountsScreen.tsx` (`L` when signed in) shows an `email unverified — r
resend, or run \`patches verify <code>\``banner whenever`session.emailVerified`is
false, and`r`there calls`AuthService.ResendVerification` the same way.

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

**Followers and following lists (`screens/ActorListScreen.tsx`)**: `ProfileScreen` shows count summaries and binds `F` to view that actor's followers and `G` to view that actor's following list (also reachable for the signed-in user via `:followers` and `:following` command palette commands). `ActorListScreen` renders a paginated list of actors (`usePaginatedList<Actor>`) with nameplate decoration; `j`/`k`/arrow keys move the selection cursor, `Enter` or `o` opens the selected actor's profile, and `Esc` returns to the previous screen.

**Nameplates, plain mode, and content warnings (B-018/B-019/B-022)**:
`components/Nameplate.tsx` renders `@handle` styled by `Actor.nameplate` (spec §173) —
a colour (or the first stop of a `"start,end"` gradient; Ink's `<Text>` has no gradient
primitive) plus a glyph. Truecolor→256→16→none degradation is left to Ink/chalk's own
`getColorDepth()`/`NO_COLOR` detection rather than reimplemented client-side.
`ProfileScreen` also shows `nameplate.statusLine` and `nameplate.badges`, and now
(B-022) a text-mode analogue for the two remaining fields the proto leaves free-form
(no defined vocabulary — write-time validation is against node capabilities, spec §174,
not a fixed enum): `avatar_frame` brackets the display name (`‹ name ›`), and
`profile_border` selects an Ink `Box` `borderStyle` around the whole header (falls back
to `'round'` for a value that isn't one of `cli-boxes`' seven named styles).

**Plain mode (B-022, spec §173's required "plain mode that strips all decoration")**:
`theme/plain-mode.tsx`'s `PlainModeProvider`/`usePlainMode()` context (not a `plain`
prop threaded through every `Nameplate` call site — `PostRow`, `SearchScreen`,
`ProfileScreen`, `NotificationsScreen`, …) strips nameplate colour, glyph, badges,
status line, avatar frame, and profile border everywhere at once. On at startup via
`PATCHES_PLAIN=1` or `--plain` (`cli/args.ts`, normalized into the `env` `App` reads —
one source of truth), or toggled at runtime with `P`.

`Post.content_warning` collapses `PostRow`'s body behind a click-to-reveal banner; `v`
on the selected `PostList` row toggles per-post reveal state (never persisted).
`format/sanitize.ts` strips C0/C1 control characters from every rendered user string
(handle, display name, bio, body, content warning, nameplate glyph) so a hostile value
can't smuggle terminal escapes into the render tree (spec §153/§104).

`Post.filtered_by` (spec §198.3/§199.3 — set only for `collapse`/`warn`, since a `hide`
match never reaches the client) renders via `format/filtered-by.ts`'s
`describeFilteredBy`: `collapse` folds the body behind one muted "filtered: <name> (via
@owner) — press v to expand" line, sharing `PostRow`'s existing per-row `v` fold toggle;
`warn` shows the same line above the untouched body. `Post.labels` (spec §200.3/§203)
render as compact `[value]` chips inline on the attribution row.

**Follow requests (§197.5)**: `Relationship.requested`/`requested_by` surface on
`ProfileScreen` — `requested` shows "follow requested" in place of the normal follow
state (`f` cancels it via `UnfollowActor`, which also deletes the outstanding
`FollowRequest`); `requested_by` shows "wants to follow you — a accept · x reject",
wired to `AcceptFollowRequest`/`RejectFollowRequest`. `NotificationsScreen` renders
`NOTIFICATION_TYPE_FOLLOW_REQUEST` rows with a hint to `:followrequests`, where they are
actually resolved (`FollowRequestsScreen`'s own `A`/`D`).

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

**Reactions and bookmarks (P4-004, spec §53/§79)**: `l`/`b` on a post row call `App`'s
`toggleLike`/`toggleBookmark` — optimistic (flip `viewerState`/`counts` immediately,
call `ReactionService.LikePost`/`UnlikePost`/`BookmarkPost`/`UnbookmarkPost`, revert and
show a notice on failure), same shape as `ProfileScreen`'s `toggleFollow`. The optimistic
state lives in one `Map<postId, ReactionOverride>` at the `App` level
(`reactionOverrides`/`decoratePost`), not inside any single screen's own paginated list —
`PostList`'s new `decorate` prop (part of the shared `PostRowActions` bundle) applies it
at render time, so a like registers immediately no matter which list (home/local/
profile/thread/bookmarks) is currently showing that post. `g b` opens
`screens/BookmarksScreen.tsx` (`ReactionService.ListBookmarks` — private, never another
actor's), reusing `PostList` exactly like every other feed.

**Notifications (P4-004, spec §56/§113)**: `g n` opens `screens/NotificationsScreen.tsx`
— `NotificationService.ListNotifications`, keyset-paginated (`hooks/usePaginatedPosts.ts`'s
`usePaginatedList<T>`, generalized from the Post-specific hook so both share one
implementation). Each row shows a type icon/label (FOLLOW/LIKE/REPLY/MENTION/MODERATION),
the triggering actor's nameplate, and relative time; `Enter` opens the related post's
thread or the actor's profile; `m` calls `MarkNotificationsRead({ markAll: true })` and
marks every currently-loaded row read locally (no refetch just to reflect that — spec:
manual refresh is fine, no push infra in v0). The status bar's unread badge
(`hooks/useUnreadCount.ts`) polls `GetUnreadCount` every 60s and on every screen change;
`m` also bumps a small `unreadNonce` in `App` so the badge updates immediately rather
than waiting for the next poll.

**Moderation (P4-004, spec §55, §61–64)**: on `ProfileScreen`, `B` block/unblock and `M`
mute/unmute (spec's own baseline table uses lowercase `m`; this deviates deliberately —
see `.claude/rules` "exact keybindings may evolve") each go behind a `y`/`n` confirm,
reusing the same `GetRelationship`-backed state `f`/`toggleFollow` already fetches
(`Relationship.blocking`/`muting`) rather than a second round trip. `!` — on a post row,
or on a profile — opens `screens/ReportScreen.tsx`: a `j`/`k` reason picker (the six
non-`UNSPECIFIED` `ReportReason` values) plus optional free text, explicit `Ctrl+S` submit
only (same convention as `ComposeScreen` — `Enter` never silently submits), calling
`ModerationService.ReportPost`/`ReportActor`. No admin/moderator UI (resolving a report,
suspending an account) — spec §65 puts that in the admin CLI, not here.

**Editing your own profile (A-027, A-037)**: `e` on `ProfileScreen`, only when
`actorId === viewerActorId`, opens `screens/EditProfileScreen.tsx` — display name, bio
(the only multi-line field; `Enter` inserts a newline there and is a no-op in the
single-line fields), location, and website, plus a "Nameplate" section (spec §173): name
colour, glyph, status line, avatar frame, and profile border, each edited the same way,
with a live `components/Nameplate.tsx` preview above them. `Tab`/`↓` and `Shift+Tab`/`↑`
move focus across all nine fields. `Ctrl+S` sends `ActorService.UpdateProfile` with an
`update_mask` containing only the top-level fields that actually changed (never the
whole profile) plus, if any nameplate field changed, a single `"nameplate"` path
carrying _all five_ nameplate fields' current values — `Nameplate` is one submessage on
the wire, so a mask that only names it re-sends the whole thing, not per-field deltas.
`Esc` discards every edit. On save, `App` folds the server's returned `Actor` into
`session.actor` and returns to `profile`, which remounts and re-fetches via
`useActor`'s normal `GetActor` effect — no separate "refresh" plumbing needed. The same
edit is available headless: `patches profile edit [--display-name] [--bio] [--location]
[--website] [--name-color] [--glyph] [--status-line] [--avatar-frame] [--profile-border]`
(`apps/tui/src/cli/profile.ts`) sends the identical `update_mask`-scoped request,
merging any nameplate field left unspecified from the current session actor (same "never
blank a field the caller didn't ask to change" rule), and prints `@handle · display name`.

**Patches Pages (P45-004..007, P12-109, B-023, B-024)**: `v` on `ProfileScreen` opens the
viewed actor's page, `g v` the caller's own, and `patches visit @handle[/slug]`
(`cli/args.ts`) launches the TUI straight onto `screens/PageScreen.tsx`, skipping
`connect`. Full renderer/editor detail (block types, the `$EDITOR` round trip) lives in
`docs/architecture/pages.md` §6, not duplicated here — the summary: `[`/`]` switches
sub-pages (one `GetPage` fetches the whole document, so this is client-side, no re-fetch),
`j`/`k`/`Enter` select and open a `Links` entry externally, `s` signs the guestbook when
one is present and the viewer has a session, `e` (owner only) opens `$VISUAL`/`$EDITOR`
on the raw document JSON, and `E` (owner only, B-023) opens
`screens/PageBlocksEditorScreen.tsx` instead — a structured, block-by-block form editor
(`j`/`k` select, `J`/`K` reorder, `a` add via a type picker, `d` delete with a `y`/`n`
confirm, `Enter` edit the selected block's own scalar fields, `Ctrl+S` validates the
whole document with `parsePageStrict` and saves) that shares `PageScreen`'s
`draftStore`/`$EDITOR` draft, so `Esc`ing out of either editor never loses the other's
in-progress edit. `apps/tui/src/pages/block-editor-schema.ts` hand-mirrors each
`@patches/domain` block schema's _shape_ (which fields exist, what kind each is) — same
"kept in sync by hand, not derived by introspecting another package's zod internals"
convention `EditProfileScreen`'s length limits already use — while importing the actual
character/item limits (`PAGE_SHORT_TEXT_MAX_CHARS`, `PAGE_MAX_TOP_EIGHT`, …) from
`@patches/domain` directly, since that package (unlike `apps/server`) has no server
dependency and is meant to be shared. `Links` blocks list/reorder/delete like any other
but aren't reachable from the structured form's `Enter` yet (its per-link array-of-objects
shape doesn't fit the "scalar or comma-separated string list" fields the form supports) —
the hint there points back at `e`'s raw-JSON editor. The `Friends` block (B-024) is no
longer a placeholder: it calls `SocialGraphService.ListMutualFollows` and renders
nameplated handles the same way `TopEight` does. `SearchScreen` (B-028) also recognizes a
`user@domain`-shaped query (no `acct:` prefix) and resolves it via
`ActorService.ResolveActor` instead of the usual local `SearchActors` call — needs a
session (shows a sign-in prompt otherwise), and shows "This node has federation
disabled" for a gRPC `UNIMPLEMENTED` rather than the generic network-error copy.

**Responsive Pages grid and pinned posts (P12-109)**: `apps/tui/src/pages/render/grid.ts`'s
`planPageGrid(blocks, width)` lays a sub-page's blocks into 1–3 lanes by the same width
tiers `app/responsive-layout.ts` already defines (`narrow`/`standard`/`wide`) — narrow is
always one column in document order; standard splits text-ish blocks into a main lane with
`TopEight`/`Badges`/`Friends`/`Links` in a right-hand sidebar lane; wide splits that sidebar
further into two lanes once there are two or more sidebar-shaped blocks. A sub-page with
nothing sidebar-shaped stays single-column at every tier. `PageScreen` passes its own
content width net of its border/padding (`innerWidth`) so a themed, bordered page's grid
never plans against the outer terminal width and overflows its own frame. `Gallery` blocks
use the same tier→column mapping (`galleryColumnsFor`) for their own 1–3-column image grid;
`AsciiArt` blocks are centred and hard-clipped (never wrapped) to their lane's width,
string-width measured the same way the status bar's hint line is
(`format/measure.ts`'s `truncateToWidth`). `PinnedPostsSection`
(`pages/render/pinned.tsx`) renders above a sub-page's own blocks, resolving the owner's
`pinned_post_ids` via one `GetPost` each and silently dropping any that no longer resolve
(removed, or a block relationship) rather than showing an error — a missing pin is a
decoration gap, not a page failure. A page's `resolvePageTheme`d accent/border only ever
applies to `PageScreen`'s own `<Box>`, never to the shell's chrome, and plain mode strips it
regardless of what the page author set. `PageScreen.test.tsx` and
`PageBlocksEditorScreen.test.tsx` (both standalone renders, not through `App`) assert no
line exceeds 80/100/140 columns across a document exercising the grid, gallery, and clipped
ASCII art together.

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
(P4-004) covers opening a thread, the reply flow, and drill-down/`Esc`-back navigation;
`reactions.test.tsx` covers like/unlike, bookmark/unbookmark, and the bookmarks screen;
`notifications.test.tsx` covers the notification list, `m` mark-all-read, and the status
bar's unread badge; `moderation.test.tsx` covers block/mute confirm prompts and the
report screen; `b022.test.tsx` covers `avatarFrame`/`profileBorder` rendering, plain
mode (both `PATCHES_PLAIN=1` at startup and the runtime `P` toggle), and the accounts
screen (credential list, the no-SSH-agent error path, logout); `media-attach.test.tsx`
covers the compose `Ctrl+A` attach flow end to end (upload, poll-until-`READY`,
`media_ids` on submit, and the invalid-file error path) against `fake-api.ts`'s in-memory
presigned-PUT/download `fetch` interceptor (see below); `pages.test.tsx` covers
`PageScreen` navigation (sub-page switching, plain mode), guestbook signing, and the
`$EDITOR` round trip (both the happy path and a validation-error path) via an injectable
`runEditor` (mirrors `open-external.ts`'s `spawnFn` — never a real terminal hand-off in
tests). Block-type rendering itself (every §171 block plus the `Unknown` placeholder,
and B-024's `Friends` block resolving `ListMutualFollows`) is tested directly against
`PageBlocksView` in `apps/tui/src/pages/render/blocks.test.tsx`, not through the full
`App` — a `PageScreen` with a dozen-plus blocks' worth of content routinely exceeds
`ink-testing-library`'s default terminal size, and `App.tsx`'s `<Box height={rows}>`
fixed-height viewport can then hand overlapping row coordinates to two different lines'
content (both siblings' text landing on the same terminal row) — a real Ink layout
hazard worth knowing about before writing a big `PageScreen` snapshot test, not a
rendering bug in the Pages components themselves. `page-blocks-editor.test.tsx` (B-023)
covers `PageBlocksEditorScreen` through the full `App` (field editing + save, `a`'s type
picker, `J`/`K` reorder, `d`'s confirm/delete, the `Esc`-keeps-the-draft round trip
through `E` twice, and an inline validation error blocking the save) — note that its
`a`/`j`/`k` (and `EditProfileScreen`'s `Tab`) navigation handlers use the _functional_
`setState` form (`setMode((current) => …)`), not the outer render's closured `mode`;
several key presses fired in the same test tick without an intervening `await` otherwise
all read the same stale value and only the last one's effect sticks (`docs/agents/
LEARNINGS.md`'s 2026-08-18 "Ink `useInput`: index/mode state must use the functional
`setState` form" entry). `nameplate-edit.test.tsx`
(A-037) and `friends-resolve.test.tsx` (B-024's `Friends` block through `PageScreen`,
B-028's `user@domain` search) round out the same-shape coverage for this task's other
three pieces.

`test/fake-api.ts`'s `addPost(authorId, body, createdAt?, inReplyToId?)` seeds a reply
directly, and it implements `GetPost`/`ListReplies` (direct replies only, newest first —
same shape as the real `PostService.listReplies`), the full `ReactionService`/
`NotificationService`/`ModerationService` surface (likes/bookmarks tracked per user,
`addNotification(forUserId, type, options?)` seeds a notification directly, block/mute
sets feed `Relationship.blocking`/`muting`), alongside the feed RPCs it already faked.
One deliberate simplification: `GetPost`/`ListReplies`/`ListLocalFeed`/`ListActorPosts`
are anonymous RPCs in the real API too (no access token), so — same as the real server —
the fake can't personalize their `viewerState` per caller; a like/bookmark's true state
only ever comes from `ReactionService`'s own response, which is exactly what `App`'s
`reactionOverrides` overlay is for.

`fake-api.ts` also fakes `MediaService` and `PageService` (P5-003/P45-004..007):
`addMedia(mediaId, bytes, mimeType?)` seeds an already-`READY` object directly;
`beginMediaUpload`/`finalizeMediaUpload`/`getMediaDownload` drive the same state machine
`media/upload.ts` expects (skipping the real worker's `PENDING`→`PROCESSING` step — the
fake flips straight to `READY` on finalize, since `pollUntilReady`'s first poll already
sees a terminal state). The interesting part: `installFakeMediaFetch()` monkey-patches
`globalThis.fetch` once per process to intercept `https://fake-upload.patches.test/…` and
`https://fake-download.patches.test/…` URLs — reading a `PUT`'s `ReadableStream` body into
an in-memory byte store and serving it back on download — so the whole
`BeginMediaUpload`→`PUT`→`FinalizeMediaUpload`→`GetMediaDownload` round trip runs for
real, end to end, with no actual HTTP server. `addPage(handle, slug, document)` and
`addGuestbookEntry(handle, slug, authorId, body, createdAt?)` seed `PageService` state
directly; `getPage`/`updatePage` round-trip through `@patches/domain`'s own
`parsePageStrict`, so a test document that wouldn't validate server-side won't silently
"work" in the fake either.

## 15. Golden frames (P12-123)

`apps/tui/test/window.tsx`'s `renderAppInWindow(columns, rows, options)` renders the real
`App` against a synthetic `stdout`/`stdin` of an exact, resizable size, unlike
`ink-testing-library`'s own `render()`, which hard-codes 100 columns and reports no rows at
all — the only way to exercise a specific width _tier boundary_ (`shell-layout.test.tsx`,
P12-020/021/022/024/127) or capture a frame at a specific size (this section).

`apps/tui/test/golden.test.tsx` renders five representative screens — home timeline, a
thread (wide enough to trigger `SplitPane`'s two-column layout), compose, the notifications
screen, and a Patches Page — at the `standard` (100×30) and `wide` (140×40) tiers against a
fixed `FakeApiHandle` world, and diffs the SGR-stripped frame byte-for-byte against a
committed fixture under `test/golden/<scenario>.<size>.txt`. `UPDATE_GOLDEN=1 pnpm
--filter @patches/tui test -- golden` regenerates every fixture after a deliberate visual
change; every other run is the drift check, so a red run here means "this change altered
what a screen looks like," not "a network call timed out." Only `Date` is faked
(`vi.useFakeTimers({ toFake: ['Date'] })` + `vi.setSystemTime`) so `formatRelativeTime`'s
"2 minutes ago" text is deterministic — faking `setTimeout`/`setInterval` too (even with
`shouldAdvanceTime`) either starved Ink's own render scheduling of frames entirely or
reintroduced real-wall-clock drift that could flip a `createdAt` sitting on a minute
boundary between adjacent test runs; pinning `Date` alone and driving the app with the same
real-timer `flush`/`expectFrame` `harness.tsx` already exports avoided both failure modes.

`apps/tui/scripts/capture.sh [columns] [rows]` is the same idea against a _real_ terminal —
tmux, not `ink-testing-library`'s synthetic one — for eyeballing that what a real terminal
emulator does with Ink's SGR/box-drawing bytes actually matches the corresponding golden
fixture; it has no live-server dependency by default (connects to an address nothing
listens on, so the captured frame is always the deterministic "can't reach the server"
connect screen) but accepts `--server host:port [--insecure]` to capture an authenticated
screen against a real `apps/server` instead. Run it by hand after a layout change; it is not
part of `pnpm verify`.

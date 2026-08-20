---
paths:
  - 'apps/tui/**'
  - 'packages/terminal-media/**'
---

# TUI rules (Ink 7)

- **ESM only** — `apps/tui` has `"type": "module"`; Ink 7 is ESM-only, don't fight it with CJS interop hacks.
- **No network calls during render.** gRPC calls happen in hooks/an API layer (custom hooks wrapping the generated client), never inline in a component body — components stay pure render functions over state.
- **Keyboard-first.** Every interactive affordance needs a keybinding; consult the keybindings table (`docs/architecture/tui.md`) before inventing a new one — don't collide with an existing binding.
- **Minimum terminal size**: handle gracefully (message, not a crash/garbled layout) below the documented minimum (spec §72).
- **Images always need a non-Kitty fallback** (spec §75, §153) — never render a feature that only works under Kitty with no fallback path; test both paths.
- **Kitty hazards** (`docs/research/ink-kitty-graphics.md`):
  - Never `wrap="truncate"` on a placeholder row — it appends `…` and corrupts the unicode-placeholder grid.
  - Never `<Text color>` wrapping a placeholder row — color codes interleave with placeholder codepoints and break the protocol.
  - Transmit Kitty APC image sequences via `process.stdout.write` directly, **not** through Ink's own text tree — APC sequences placed inside `<Text>` get stripped by Ink's reconciler.
  - Clear images explicitly on exit/scroll-away; don't rely on terminal state resetting itself.
- **No `console.log`/`console.error`** anywhere in the render path — it corrupts the alternate-screen UI. Route diagnostics to a file logger or a dedicated debug pane.
- **Clean exit**: always restore terminal state (cursor visibility, alternate screen, Kitty image clear) on every exit path, including signals and uncaught errors — not just the happy path.
- **Never lose a compose draft** — persist to local state/disk before any risky operation (submit, navigate away); spec §80 requires drafts to survive.
- **Errors render as human-readable messages**, never a raw stack trace or gRPC status string, in the TUI itself.
- **Every cosmetic needs two off switches** (spec §185): plain mode (`P`/`PATCHES_PLAIN`) strips all decoration including the viewer's own; quiet feed (`~`) hides _other_ actors' cosmetics. Both are client-side; the server never gates them. Content (bodies, CWs, alt text, tombstones, moderation notices) always renders under both.
- **Remote decoration is hostile input** (§173, §184, §192): allow-listed glyphs only, no images/uploads, contrast floor enforced, control/escape sequences stripped, and nothing may draw outside the cells of the block being rendered.

## Measured layout (ADR 0018, P12-001/003)

- **One window-size source.** `App.tsx` is the only caller of `useWindowSize()`; it publishes the
  content box through `ContentSizeProvider` (`app/layout.tsx`). Screens read `useContentSize()` and
  never `useWindowSize()` or `process.stdout.columns/rows`. Two components measuring independently
  disagree by a row the moment a resize lands mid-render, and the frame overflows.
- **Every measured component ships a height test.** If a component's rows are counted by a
  viewport (`measurePostRowHeight`, `measureMarkupHeight`, `THEME_PREVIEW_DIMENSIONS`), it needs a
  test that renders it and asserts the drawn row count equals the measured one. A measurement that
  under-counts is what smears Ink's line diff — it is not a cosmetic bug.
- **`<Static>` is banned in the shell.** It writes above the managed frame and permanently
  desynchronises the layout the fixed-height boxes depend on. Use a bounded scrollback region.
- **`flexShrink={0}` on every direct child of a height-constrained Box.** Yoga otherwise shrinks a
  child and Ink renders that by dropping rows out of its middle.
- **Hide an overlay's background with `display="none"`, never `height={0}`.** A zero-height box is
  removed from layout but Ink still paints its text into the overlay's rows.

## Input dispatch

- Keys go through the layer stack in `app/input.tsx`; a layer returns `true` only for keys it
  actually consumed, so shell safety keys stay reachable from every sub-mode.
- **Ink parses one stdin chunk into one keypress.** Keys typed fast enough to arrive together
  become a single multi-character `input`; split coalesced runs (`isCoalescedKeyRun`) or two-key
  sequences silently stop working under fast typing.
- **Multi-key prefix state lives in a ref**, not `useState` — the same handler closure serves every
  key in a chunk, so state written by one key is stale for the next.
- **Index/mode state advanced by `useInput` must use the functional `setState` form**
  (`setMode((current) => ...)`), never the render closure's captured value — a tight loop of key
  presses with no `await` between them (a test, or fast real typing) fires every keystroke before
  React commits the first update, so a closure-based update only ever moves by one regardless of
  how many keys fired.

## Post bodies

- Rich text goes through `format/markup.ts` — one sanitizer, one AST, one layout. Never add a
  second parser, and never render a body straight from the wire.
- Plain mode shows source markers; it must never drop characters.

## Non-TTY safety and verification

- `useInput` throws when stdin isn't a TTY: gate interactive hooks on `useStdin().isRawModeSupported` and keep the non-interactive subcommands (`patches ping`, `--version`) working — CI and agents use them.
- To verify the full-screen app from a non-TTY shell, drive it in tmux (`tmux new-session -d -x 100 -y 28 "<cmd>"`, `tmux send-keys`, `tmux capture-pane -p`) and read the actual frame — several layout bugs (a `height={0}` overlay bleeding text, a coalesced-keystroke bug) only ever showed up under tmux, never in unit tests. To drive a _real_ terminal (Kitty support etc.) use `ghostty -e wrapper.sh` with Python's `pty.spawn` logging (redirecting stdout to a file makes the app see "not a TTY"; `script` isn't installed on Fedora by default). GNOME denies `org.gnome.Shell.Screenshot` to arbitrary callers, so pixel screenshots need a human.

## Testing

- **`FORCE_COLOR` in the shell silently rewrites every Ink frame assertion.** Chalk decides color
  from the host env, so `ink-testing-library` frames carry SGR codes for anyone with `FORCE_COLOR`
  set and none for anyone else — `toContain('some phrase')` and `waitForFrame` both break when a
  styled phrase has color codes inside/between it. Fix: pin `env: { FORCE_COLOR: '3' }` in
  `apps/tui/vitest.config.ts` (matches how the real TUI runs) and strip SGR in the shared frame
  matcher (`test/ansi.ts`); assert `hasNonSgrEscape`, not "no escapes at all".
- **`waitForFrame`/`expectFrame` (poll `lastFrame()` on a condition) trade a flake for two subtler
  bugs**: (1) a substring that's already true in a _persistent_ or list-visible string (e.g.
  `'following'` matching `'not following'`, or text already present before navigating to the
  screen meant to show it fresh) resolves instantly on the wrong state — pick a target unique to
  the _settled_ state, not the first substring that becomes true; (2) resolving the instant a
  condition is true removes the incidental "settle" grace period a fixed sleep used to provide —
  a `press()` right after a resolved wait can be dropped if it depends on a `useInput` handler that
  hasn't re-subscribed with the just-committed closure yet (screen transitions, post-login global
  keys). Keep one small `await flush()` between a resolved wait and the next `press()` in those
  cases — a deliberate exception, not a leftover fixed sleep.
- **`apps/tui`'s Ink-render tests need `fileParallelism: false`** (set in
  `apps/tui/vitest.config.ts`) — under default parallelism, enough CPU contention across 15+
  concurrent Ink-tree test files makes `flush()` occasionally resolve before a promise-driven React
  state update actually committed. No other package drives Ink, so this is `tui`-only.
- **Test a renderer by comparing against its own output, not a regex.** `AsciiRenderer` and
  `HalfBlockRenderer` use different glyph sets chosen by color-support detection — assert against
  the exact first row from calling the renderer directly (with a real `sharp`-generated fixture
  image), not a "looks like art" character-class regex that silently passes/fails depending on
  which renderer got constructed.

## Proto message fields arrive as `null`

`@grpc/proto-loader` with `defaults: true` (our `PROTO_LOADER_OPTIONS`) decodes an unset
message-typed field (`counts`, `avatar`, `editedAt`, `post`, …) as **`null`**, while ts-proto's
types say `undefined`. Never test `=== undefined` on such fields — use `present()` from
`apps/tui/src/api/present.ts`. (Found the hard way: the app crashed on `author.counts.posts`.)

## Direct messages (§183.1, §194)

The messages screen MUST render, on the screen itself (not help/tooltip), the exact notice:
"Not end-to-end encrypted — this node's operators can read these messages". No TUI string may
describe DMs as "encrypted", "secure" or "private" (a test greps for it). No attachment or
link-preview affordance in DMs in v0.

# Can ink-web host the Patches TUI as a "try it in the browser" demo?

Verified 2026-08-18 against: [ink-web.dev](https://www.ink-web.dev/) · [ink-web.dev/docs](https://www.ink-web.dev/docs) ·
[ink-web.dev/docs/installation/vite-plugin](https://www.ink-web.dev/docs/installation/vite-plugin) ·
[ink-web.dev/docs/components](https://www.ink-web.dev/docs/components) ·
[github.com/cjroth/ink-web](https://github.com/cjroth/ink-web) (README, `package.json`, and source read
directly: `packages/ink-web/src/{xterm-ink.tsx,vite-plugin.ts,index.ts,core.ts,shims/*}`) ·
`registry.npmjs.org/ink-web` (published `package.json`, dist-tags, publish timestamps) ·
[vadimdemedes/ink readme.md](https://raw.githubusercontent.com/vadimdemedes/ink/master/readme.md) (current/master,
tag `v7.1.1` is the newest tag in the repo) · this repo: `apps/tui/package.json`, `apps/tui/src/cli.tsx`,
`apps/tui/src/app/App.tsx`, `apps/tui/src/api/client.ts`, `packages/terminal-media/src/{renderer.ts,detect.ts}`,
`docs/research/ink-kitty-graphics.md` (existing note, corroborates the Ink hook surface used by this repo).

**Bottom line:** viable-with-changes, but not a thin wrapper. ink-web only _documents_ Ink 6.x support against
an Ink 7.1.1 app, and the TUI's shared component tree currently imports several Node built-ins (`node:fs`,
`node:os`, `node:child_process`, `node:crypto`) and one native addon (`sharp`) that have no browser equivalent.
A real "try it in the browser" demo needs a swap-in transport, credential store, and media renderer, plus a spike
to confirm Ink 7 actually works under ink-web before investing further (its published compat matrix stops at 6.8).

---

## 1. What ink-web is (documented)

- Package name `ink-web` on npm, monorepo also containing `ink-ui` (a separate shadcn-registry component set —
  not relevant here) and `ink-testing`. Source: `github.com/cjroth/ink-web` (GitHub API: 84 stars, 2 forks, 130
  commits on `main`, MIT `LICENSE`). Maintainer: Chris Roth (`cjroth`), a personal/community project — **not**
  published or endorsed by Vadim Demedes (Ink's author) or the Ink org.
- npm registry (`registry.npmjs.org/ink-web`, fetched 2026-08-18): latest version **`0.2.0`**, published
  **2026-03-02**; package first published 2025-11-11. GitHub's own Releases tab lags at `v0.1.14`
  (2026-02-28); `v0.2.0` exists only as a git tag with no release notes. This is a young, fast-moving,
  low-adoption project — treat every claim below as subject to change without a changelog entry.
- License: MIT (both npm `package.json` and GitHub `LICENSE`).
- **Documented compatibility matrix (GitHub README)**: `ink-web 0.1.17+` ↔ **`ink 6.5–6.8+`**, `xterm.js 5.x`,
  `React 19.x`. The published `0.2.0` `package.json` `peerDependencies` confirm this in code:
  `"ink": "^6.0.0"`, `"react": "^19.0.0"`, `"react-reconciler": "^0.33.0"`, `"scheduler": "^0.27.0"`,
  `"vite": ">=7.0.0"`, `"@xterm/xterm": ">=5.0.0"`.
  **This repo's `apps/tui` pins `ink: ^7.1.1`** (`pnpm-workspace.yaml` catalog). Ink 7 is a real major bump
  from 6.x (this repo's own `docs/research/ink-kitty-graphics.md` is titled "...in Ink 7" and documents 7.x
  APC-stripping behavior). ink-web has never declared Ink 7 support. **Flagged discrepancy, see §6.**
- Rendering mechanism (documented + confirmed in source): ink-web mounts a real
  [xterm.js](https://xtermjs.org/) `Terminal` instance in a DOM container (`InkTerminalBox` / `InkXterm`
  components, `@xterm/addon-fit` for resize) and calls the **real, unmodified `ink` package's `render()`**
  against custom `stdout`/`stdin`/`stderr` stream objects that write into/read from that terminal. It is not a
  DOM-based reimplementation of Ink's renderer, and not a from-scratch terminal emulator — every character cell,
  color, and cursor movement is genuine ANSI written to `xterm.js`.

## 2. How the stream shim actually works (read directly from `packages/ink-web/src/xterm-ink.tsx`)

`mountInkInXterm(element, opts)` is the low-level entry point (`InkTerminalBox`/`InkXterm` wrap it):

- Builds a `stdout` object: a `Writable`-like shim whose `write()` calls `term.write(str)`, plus
  `columns`/`rows` (from `term.cols`/`term.rows`), `isTTY: true` (hardcoded), `setDefaultEncoding`, `cork`/`uncork`.
- Builds a `stdin` object: a `Readable`-like shim fed by `term.onData(data => inputBuffer.push(data))`, which
  `emit('readable')`s; exposes `read()`, `columns`/`rows`, `isTTY: true` (hardcoded), `setEncoding`,
  **`setRawMode: (_raw) => {}` (a no-op — always "succeeds")**, `resume`/`pause`/`ref`/`unref`.
- Calls `render(element, { stdout, stderr: stdout, stdin, patchConsole: false })` — the actual `render()` from
  the `ink` npm package, imported normally (`import { render } from 'ink'`).
- Resize: a `ResizeObserver` + `window.resize` listener calls `fitAddon.fit()`, updates `stdout.columns/rows`
  and **emits `'resize'` on the `stdout` object** — the same event Ink's own resize handling listens for on a
  real TTY stream (this repo's `ink-kitty-graphics.md` notes Ink's `useWindowSize()` "re-renders on SIGWINCH";
  ink-web has no SIGWINCH in a browser, so it substitutes a synthetic `stdout` `'resize'` emit — **inferred
  from source that this is functionally equivalent for Ink's internals, not independently verified against
  Ink's resize-handling source in this pass**).
- Also strips Ink's `clearTerminal` escape sequence (`\x1b[2J\x1b[3J\x1b[H`) and replaces it with cursor-home on
  narrow-resize only, specifically to avoid an xterm.js full-screen flash — a workaround for a real interaction
  bug between Ink's resize repaint strategy and xterm.js's reflow, documented in code comments in that file.
- Ink's Yoga (WASM layout engine) init is awaited (`getYogaInit()`) before the first `render()` call — an
  ordering requirement, not something Patches code needs to handle itself.
- Ink's public hooks are **re-exported unmodified from the real `ink` package** in `packages/ink-web/src/index.ts`:
  `Box, measureElement, Newline, render, Spacer, Static, Text, Transform, useApp, useFocus, useFocusManager,
useInput, useIsScreenReaderEnabled, useStderr, useStdin, useStdout`. Because these are the genuine Ink
  hooks operating against stream objects that satisfy the stream contract Ink expects (`isTTY`, `columns`/`rows`,
  `setRawMode`, `on('readable')`/`.read()`, `.write()`), `useInput`, `useStdin().isRawModeSupported`
  (inferred `true`, since `stdin.isTTY` is hardcoded `true` and `setRawMode` never throws), and `useStdout()`
  should work as documented Ink APIs. **This is source-level inference, not something ink-web's docs assert
  explicitly** — no automated test in the ink-web repo was inspected for `useInput`/`useStdin` behavior in this
  pass (there is a `test/` dir with `InkXterm.test.tsx`, `ink-render.test.tsx`, `resize.test.ts` — not read).
- **`useWindowSize` is conspicuously absent from that re-export list**, even though it is a real, currently
  documented Ink hook (`vadimdemedes/ink` master readme, `#### useWindowSize()`, "A React hook that returns
  the current terminal dimensions and re-renders the component whenever the terminal is resized" — matches
  this repo's usage in `apps/tui/src/app/App.tsx`). Two explanations are consistent with the evidence and
  **neither is confirmed in this pass**: (a) `useWindowSize` didn't exist in Ink 6.x (ink-web's declared peer
  range) and the re-export list is simply stale for Ink 7, or (b) it was an intentional omission for another
  reason. Given `apps/tui` calls `useWindowSize()` directly from `'ink'` (not from `'ink-web'`), and ink-web's
  Vite plugin does **not** alias the `ink` module itself (see §3), the hook would still resolve to the real
  `ink` package — so this omission likely doesn't block anything, but it is a signal worth smoke-testing first,
  not assuming.
- Alt-screen: Ink 7's `render(el, { alternateScreen: true })` (used in `apps/tui/src/cli.tsx`) writes the DEC
  private mode 1049 escape sequences; ink-web's `stdout.write` passes all writes straight through to
  `term.write()`. xterm.js is a full terminal emulator and its DECSET 1049 handling is a documented xterm.js
  feature, but **this was not independently re-verified against xterm.js's own docs in this pass** — flagged as
  inferred, and it is exactly the kind of thing to check first, since `apps/tui`'s alternate-screen behavior is
  load-bearing (`cli.tsx` comment: "Ink 7 owns the alternate screen and restores the original buffer on exit").

## 3. Node built-in shims — what exists and what doesn't (read directly from `vite-plugin.ts` and `src/shims/`)

`inkWebPlugin()`'s Vite `resolve.alias` map (exact list, from source) aliases these import specifiers to
browser shims: `cli-cursor`, `supports-color` / `#supports-color`, `signal-exit`, `window-size`,
`terminal-size`, `tty` / no `node:tty` alias, `process` / `node:process`, `events` / `node:events`,
`stream` / `node:stream`, `module` / `node:module`, `buffer` / `node:buffer`, `fs` / `node:fs` (a stub —
`fs-inject.ts`/`fs.ts` exist, not inspected in depth in this pass, but the plugin's own build script is named
`fix-bundled-fs.ts`, implying it's a minimal facade, not a real filesystem), `path`/`node:path` → the
third-party `path-browserify` package, and a special-cased `chalk` shim.

**Not in that alias map, and not shimmed anywhere found in `src/shims/`: `node:crypto`, `node:os`,
`node:child_process`, `net`, `tls`, `http2`, `dns`.** This is a directly load-bearing gap for this repo:

- `apps/tui/src/api/client.ts` (`PatchesApi`, the class the task asks about) is built on `@grpc/grpc-js`,
  which needs raw TCP/TLS/HTTP2 sockets — categorically unavailable in a browser sandbox regardless of shims
  (browsers have no socket API). **`PatchesApi`'s current gRPC transport cannot run in ink-web at all** — this
  is the reason the task frames the question around swapping it for `@patches/client`'s Connect transport.
- `import { randomUUID } from 'node:crypto'` appears in `apps/tui/src/app/App.tsx`,
  `apps/tui/src/api/client.ts`, `apps/tui/src/cli/register.ts`. `randomUUID()` also exists as
  `globalThis.crypto.randomUUID()` in every modern browser (Web Crypto API) — a low-risk swap
  (`const randomUUID = () => crypto.randomUUID()`), but it is not automatically shimmed by ink-web today, so
  bundling would fail on `node:crypto` resolution until it's replaced at each call site.
- `import { createHash } from 'node:crypto'` (`apps/tui/src/media/validate.ts`,
  `apps/tui/src/auth/ssh-login.ts`, `packages/terminal-media/src/renderer.ts`) and
  `import { randomInt } from 'node:crypto'` (`packages/terminal-media/src/protocol/kitty.ts`) have no
  drop-in Web Crypto equivalent (`SubtleCrypto.digest()` is async and returns an `ArrayBuffer`, a different
  shape) — these need a small cross-platform hashing helper, not a straight import swap.
- `node:fs` / `node:fs/promises` / `node:os` (`homedir`, `tmpdir`) are used throughout auth (credential
  storage), compose drafts, page drafts, and media caching (`apps/tui/src/auth/credential-store.ts`,
  `apps/tui/src/compose/draft-store.ts`, `apps/tui/src/pages/draft-store.ts`, `apps/tui/src/media/cache.ts`).
  None of this is meaningful in a browser sandbox — there is no home directory, no persistent filesystem
  across page loads (short of IndexedDB/localStorage, which is a different API entirely).
- `node:child_process` (`spawn`/`spawnSync`/`execFileSync`) is used to shell out to `$EDITOR`
  (`apps/tui/src/pages/editor.ts`), to a URL opener (`apps/tui/src/media/open-external.ts`,
  `apps/tui/src/pages/open-link.ts`), and by `packages/terminal-media/src/detect.ts` to probe terminal
  capabilities. No browser equivalent exists for "spawn a subprocess"; these features have no meaningful
  browser analog (opening a link should become `window.open`, the rest should be disabled in a web build).
- `@napi-rs/keyring` (`apps/tui/package.json` dependency, OS keychain access for credential storage) is a
  native Node addon. Native addons cannot load in a browser at all — not a shimming problem, a hard
  impossibility. (Not independently re-verified against `@napi-rs/keyring`'s own docs in this pass; asserting
  this from the general nature of native N-API addons, which is safe to treat as fact.)
- **`sharp` is a native Node addon (libvips bindings)** — `packages/terminal-media/src/renderer.ts` does
  `import sharp from 'sharp'` **at module scope**, and `apps/tui/src/cli.tsx` calls
  `createRenderer(graphicsCapabilities)` (which pulls in `renderer.ts`) **unconditionally on every startup**,
  regardless of whether the terminal actually supports Kitty graphics. If that import graph is bundled
  as-is for a Vite/browser build, the build fails outright — `sharp` has no browser build and nothing in
  ink-web's shim list touches it. This is the single biggest structural blocker to a naive "just run the same
  entry point through Vite" approach, and it needs to be fixed by making the sharp-dependent renderer a lazy
  (dynamically-imported) module that a web build simply never imports, not by trying to shim `sharp`.

## 4. Keyboard / mouse / networking (documented + source)

- Keyboard: xterm.js's own `term.onData()` feeds raw terminal-escape-sequence input into the shimmed `stdin`,
  which Ink's real key parser then interprets exactly as it would a real PTY — this is the same mechanism a
  real terminal uses, so `useInput` keybinding logic in `apps/tui`'s screens (`App.tsx`, every `*Screen.tsx`)
  should require no changes. ink-web.dev's GitHub README lists "Keyboard and mouse handling" and "Fetch,
  WebSocket networking" as supported (**documented claim, exact mechanism for mouse not found in the source
  paths read in this pass** — `xterm-ink.tsx` wires keyboard via `term.onData`; no explicit SGR-mouse-mode
  wiring was seen, and `apps/tui`'s own code has no mouse-event usage per a repo grep, so this is moot for
  Patches either way).
- Networking: "Fetch, WebSocket networking" is stated on the GitHub README as a supported capability — this
  is a browser capability, not something ink-web adds; it's really just "the browser sandbox permits `fetch`
  and `WebSocket`, and nothing about ink-web blocks them." That's exactly the two transports Connect protocol
  (`@connectrpc/connect-web`) is built on, which is why the Connect transport approach is the correct one here
  rather than attempting grpc-web-over-`@grpc/grpc-js` or a raw socket polyfill (impossible per §3).

## 5. `apps/tui`'s `PatchesApi` shape (for the seam)

`apps/tui/src/api/client.ts` exports `class PatchesApi` (line 162) built directly on
`@grpc/grpc-js`'s `credentials`, `Metadata`, `ServiceError`, and `@patches/proto`'s generated
`create*Client`/`*GrpcClient` factories (Actor, Auth, Feed, Media, Moderation, Node, Notification, Page, Post,
Reaction, SocialGraph, System). It is consumed as a single object across `apps/tui/src/screens/*.tsx`,
`apps/tui/src/hooks/*.ts`, `apps/tui/src/auth/session.ts`, and `apps/tui/src/cli/*.ts` — i.e. it's already a
single seam by convention (screens don't reach into `@grpc/grpc-js` directly), which is favorable: swapping the
transport is plausible without touching every screen, **provided `PatchesApi`'s public method surface is
extracted to an interface** that a `@grpc/grpc-js`-backed implementation and a `@connectrpc/connect-web`-backed
implementation can both satisfy, and every call site depends on the interface, not the concrete class.

## 6. Discrepancies with spec/training assumptions

1. **Version gap, unresolved.** ink-web's only documented/declared compatibility is Ink 6.5–6.8 (peer dep
   `^6.0.0`); this repo runs Ink 7.1.1. Nothing in ink-web's docs, README, or `package.json` claims Ink 7
   support. Ink 6→7 is a real major version with behavior changes (this repo's own `ink-kitty-graphics.md`
   documents Ink-7-specific APC-stripping behavior not present in 6.x). This is exactly the kind of "training
   knowledge/assumption" gap the harness asks to flag rather than paper over — **do not assume ink-web works
   with Ink 7 until a spike proves it.**
2. **Not an ADR-level architectural conflict** with the spec's hard rules (§153 etc.) — ink-web is a bundler
   plugin + a browser stream shim, not a competing framework choice, and it doesn't touch gRPC/TypeORM/ranking
   rules. But note it _would_ require the Connect transport (already planned per `@patches/client`) to become
   the real network layer for any browser target, which is consistent with, not contrary to, existing repo
   direction.
3. Web is explicitly **paused** per `CLAUDE.md` Amendment B (§179, "Web + React Native are paused until board
   Phase 11 ships"). A "try it in the browser" TUI demo is adjacent to, and could be read as in tension with,
   that pause — **flagging for the orchestrating agent/architect to confirm this task is in scope before
   implementation work starts**, not deciding it here.

## 7. Recommendation

**Viable-with-changes** — conditional on a short spike passing first, and understood as a _curated read-only
or limited-auth demo_, not a full-parity port of `apps/tui`.

**Required abstraction seams (files that need one) before any browser build can exist:**

1. `apps/tui/src/api/client.ts` — extract a `PatchesApi` interface (or reuse whatever `@patches/client`'s
   Connect transport already exposes) so a `@grpc/grpc-js`-backed CLI implementation and a
   `@connectrpc/connect-web`-backed browser implementation can both satisfy it. This is the change the task is
   fundamentally asking about, and it's the most tractable one — `PatchesApi` is already consumed as a single
   object everywhere.
2. `apps/tui/src/auth/credential-store.ts` (+ `apps/tui/src/cli/auth-shared.ts`'s `openCredentialStore`) —
   needs a browser implementation with no `node:fs`/`node:os`/`@napi-rs/keyring` (memory-only or
   `sessionStorage`-backed at most; a browser demo almost certainly should not persist credentials at all).
3. `apps/tui/src/auth/ssh-agent.ts`, `ssh-login.ts`, `ssh-enroll.ts` — SSH-agent-based login reads a local
   `~/.ssh` and talks to an OS SSH-agent socket; there is no browser equivalent. Exclude this login path
   entirely from a web build.
4. `apps/tui/src/pages/editor.ts` (shells to `$EDITOR`) and `apps/tui/src/media/open-external.ts` /
   `apps/tui/src/pages/open-link.ts` (shell to an OS URL opener) — replace with `window.open()` for links; page
   composition needs an in-app textarea/editor for the web build, since spawning `$EDITOR` is meaningless.
5. `apps/tui/src/compose/draft-store.ts`, `apps/tui/src/pages/draft-store.ts`,
   `apps/tui/src/media/cache.ts` — `node:fs`-backed persistence; needs an IndexedDB/localStorage
   implementation or must be disabled (no drafts/cache) for a web demo.
6. `packages/terminal-media` (`renderer.ts`'s `sharp` import, `detect.ts`'s `execFileSync` probe,
   `protocol/kitty.ts`'s `node:crypto` use) — the Kitty-graphics/image path must become a lazily-imported
   module that a web build never pulls in, with `detectTerminalGraphics()` given a web variant that always
   returns "unsupported" so the app takes the plain-text image fallback that already exists (per the task's
   own framing) — this is a real requirement, not a nice-to-have, because `sharp`'s native addon cannot be
   bundled for a browser at all and its import is currently unconditional at CLI startup.
7. Every direct `node:crypto` call site (`app/App.tsx`, `api/client.ts`, `cli/register.ts`,
   `media/validate.ts`, `auth/ssh-login.ts`, `terminal-media/protocol/kitty.ts`) — `randomUUID()` swaps
   cleanly to `crypto.randomUUID()` (a browser global too); `createHash`/`randomInt` need a small
   cross-platform helper or must live only on the excluded (§3, §6) code paths.
8. New Vite entry point under a new app (e.g. `apps/tui-web`, out of scope to name definitively here) wired
   with `inkWebPlugin()` from `'ink-web/vite'`, mounting the _same_ shared screen components via
   `InkTerminalBox`/`mountInkInXterm` — this is additive (a new build target reusing existing React
   components), not a rewrite of `apps/tui`'s CLI entry (`cli.tsx` stays Node-only).

**Effort estimate:** not a one-task swap. Suggested breakdown as agent-tasks:

- **1 spike task** (go/no-go): scaffold a minimal Vite + `inkWebPlugin()` app, mount a trivial screen from
  `apps/tui` (e.g. `LoginScreen` or a static screen with no I/O) through `InkTerminalBox`, confirm Ink 7.1.1
  actually renders, that `useInput`/`useStdin().isRawModeSupported`/alternate-screen/`useWindowSize` behave,
  and that the Vite build doesn't choke on transitively-imported Node builtins. **Do this before scoping the
  rest** — if Ink 7 doesn't work under ink-web (real risk per §6.1), the remaining tasks are moot until either
  ink-web adds Ink 7 support upstream or the repo accepts pinning a second, older Ink version for the web
  target (itself worth an ADR, not a unilateral call).
- **1 task**: extract the `PatchesApi` interface + wire the existing grpc-js implementation behind it (useful
  independent of web).
- **1 task**: Connect-Web-backed `PatchesApi` implementation (depends on `@patches/client`'s Connect transport
  landing).
- **1–2 tasks**: credential-store/auth seam for web (drop SSH-agent path, memory-only credentials).
- **1 task**: `node:crypto` call-site swaps + a tiny cross-platform hash helper.
- **1 task**: lazy-load the `sharp`/Kitty-graphics path out of the shared import graph + web-variant
  `detectTerminalGraphics()` that forces the plain-text fallback.
- **1 task**: new Vite web app scaffold + `inkWebPlugin()` wiring + deploy target.

Total: roughly **7–9 agent-tasks**, gated by the spike. This should be filed as tasks (not decided here per
this agent's scope), and the Web-is-paused question (§6.3) should go to `architect`/the orchestrator before
any of this is scheduled.

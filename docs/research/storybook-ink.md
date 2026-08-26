# Storybook for the Ink TUI — no renderer exists; frame-fixture catalog + text golden diffs

> **Status 2026-08-26 (owner decision): deferred.** No off-the-shelf Ink Storybook renderer
> exists (verified below), and the owner has dropped Ink story support for now. Web-only
> Storybook landed first (see `storybook-web.md`); this note is kept for the eventual revisit.

Stack: `ink` **7.1.1** + `ink-testing-library` **4.0.0** (installed, catalog `^7.1.1`/`^4.0.0`),
React 19.2.8, Vitest 4.1.11, Storybook latest stable 10.5.10 (checked 2026-08-26). This note
evaluates the owner's ask — Storybook-style visual management + visual regression for `apps/tui`
components at various terminal sizes, additive to the existing Ink tests. Verified 2026-08-26; every
command quoted as _run_ below was executed in this checkout.

## 1. Does a maintained Ink renderer for Storybook exist?

**No — none exists, official or community.** Verified 2026-08-26 by:

- npm registry: `storybook-ink`, `ink-storybook`, `@storybook-ink/renderer`, `storybook-terminal`
  all 404 (`pnpm view <name> version` for each).
- Web search (DuckDuckGo, "storybook renderer ink react terminal CLI components") surfaces Ink
  itself, tutorials, and generic Storybook pages — no terminal/Ink renderer project.
- Ink's ecosystem (`@inkjs/ui` 2.0.0) and the official Storybook docs' framework list (React, Vue,
  Angular, Web Components, HTML, RN, …) contain no terminal target. Storybook renders into a browser
  iframe; Ink renders ANSI to a stdout — the two models don't intersect without a bridge, and
  nobody maintains one.

So the realistic pattern is the one the owner sketched: render Ink components **in Node** to static
text frames at explicit sizes, and display those frames in an ordinary web Storybook instance.

## 2. What the repo already has (this is most of the work)

`apps/tui` already contains every primitive needed, built for P12-020/021/123:

- **`test/window.tsx` → `renderInWindow(element, columns, rows)`** — renders _any_ element into a
  fake stdout/stdin with exact `columns`/`rows` under the test's control and a real `resize` event;
  exists precisely because "`ink-testing-library` hard-codes a 100-column stdout and reports no rows
  at all". (`ink-testing-library`'s own `render` cannot take a width.)
- **`test/golden.test.tsx` (P12-123)** — committed golden frames at the two responsive-layout tiers
  (`standard` 100×30, `wide` 140×40), byte-for-byte drift check after `stripSgr`, regenerated with
  `UPDATE_GOLDEN=1 pnpm --filter @patches/tui test -- golden`, plus per-line `stringWidth ≤ columns`
  and `lines ≤ rows` guards, a frozen `Date`, and a seeded `FakeApiHandle` world (B-015).
- **`test/ansi.ts`** (`stripSgr`), **`vitest.config.ts`** pins (`FORCE_COLOR=3`, `fileParallelism:
false`, `setup-terminal.ts`), **`scripts/capture.sh`** — tmux capture of a _real_ pty for
  by-hand "does it actually look right" checks (the synthetic frames never touch terminfo).

A Storybook layer is therefore a **viewing/cataloging layer on top of this machinery**, not a new
render path.

## 3. Experiment (run 2026-08-26): width + skin injection works

Script `/tmp/opencode/ink-width-experiment.mts` (kept out of the product tree), run from `apps/tui`
as:

```
FORCE_COLOR=3 pnpm exec tsx /tmp/opencode/ink-width-experiment.mts
```

It loads the repo's real harness (`test/window.tsx`) and a real component
(`src/components/ProgressBar.tsx`) with a deliberately long label, at explicit sizes and both skins,
and reports widest-line width in terminal cells (via `string-width`, same as the golden test):

```
--- plain=false 80x24: 2 lines, widest 80 cells
Uploading a-very-long-remote-attachment-filename a-very-long-remote-attachment-…
[38;2;216;167;255m████████░░░░░░░░░░░░[39m
--- plain=false 120x40: 2 lines, widest 120 cells
Uploading a-very-long-remote-attachment-filename a-very-long-remote-attachment-filename a-very-long-remote-attachment-f…
[38;2;216;167;255m████████░░░░░░░░░░░░[39m
--- plain=true 80x24: 2 lines, widest 80 cells
Uploading a-very-long-remote-attachment-filename a-very-long-remote-attachment-…
[########------------]
--- plain=true 120x40: 2 lines, widest 120 cells
Uploading a-very-long-remote-attachment-filename a-very-long-remote-attachment-filename a-very-long-remote-attachment-f…
[########------------]
```

Findings:

1. **Explicit width injection works**: the `truncate-end` label cuts at exactly 80 vs 120 cells —
   layout genuinely differs per size.
2. **The two skins render differently from the same element tree**: rich frames carry truecolor SGR
   (`ESC[38;2;…m`), plain-mode frames swap the Unicode bar for ASCII `[####----]`. `PlainModeProvider`
   (`src/theme/plain-mode.tsx`) is the lever, and plain mode _is_ the repo's non-Kitty fallback skin
   — so the story matrix honors the hard rule "TUI always has a non-Kitty fallback" by construction.
3. **Live `resize()` did NOT re-layout** (frame identical 50 ms after `resize(120, 40)`). Root cause,
   read from the installed `ink@7.1.1` source: Ink only subscribes to `stdout.on('resize')` when
   `this.interactive` is set, and `resolveInteractiveOption` is
   `interactive ?? (!isInCi && Boolean(stdout.isTTY))` — `TestStdout` in `test/window.tsx` defines no
   `isTTY`, so it resolves `false` and the resize listener is never attached
   (`node_modules/.pnpm/ink@7.1.1*/…/build/ink.js`, `resized = () => {…}` and the
   `if (this.interactive)` subscription guard). Consequence for the design: **remount-per-size**
   (render fresh at each size — exactly what the golden tests already do) rather than live resize;
   if interactive size-switching is ever wanted, adding `isTTY = true` to the stub is the one-line
   fix, verified against source but not needed for phase 1.

## 4. The pattern: frame fixtures → web viewer

**Generate.** A `scripts/render-frames.ts` (tsx) in apps/tui loops a declared matrix (component,
props fixture, size, skin) through `renderInWindow` — with the golden test's determinism rules:
`FORCE_COLOR=3`, frozen `Date`, seeded `createFakeApi` world — and writes each frame **with SGR
intact** to `apps/tui/storybook/frames/<component>/<story>.<size>.<skin>.txt` (committed). This is a
codegen step, run on demand and in CI drift mode; stories import the text files, so **Ink never runs
in the browser** and the browser bundle never contains yoga/ink.

**Display.** A standard web Storybook instance renders `<pre>` frames. Color comes free by
converting the frame's SGR to HTML with `ansi-up` (registry: **1.0.0**, pure ANSI→HTML, no canvas/
webgl; `pnpm view ansi-up version`, 2026-08-26). `xterm.js` (`xterm` **5.3.0**) is the heavier
alternative if a _live interactive_ terminal preview is ever wanted; for static frames it adds
weight for nothing — choose `ansi-up`.

**Where the instance lives — separate instance in `apps/tui`, not apps/web's.** Reasons:

- Serving TUI stories from apps/web's instance would import `@patches/tui` source into apps/web's
  module graph (its storybook bundle, `tsc --noEmit`, eslint import rules). The layering rule that
  bites is direction: web is a leaf client that must not grow a dependency on the TUI app's graph
  (ink, yoga, sharp, keyring…). Frame _text files_ are the clean boundary — data, not code.
- apps/tui already depends on `react` (a real dependency); `storybook`, `@storybook/react-vite`,
  `react-dom`, `@types/react-dom`, `vite`, `ansi-up` would be **devDependencies only**. The package
  publishes as `patches-social` with `files: ["dist", "README.md"]`, so none of it ships. tsup's
  entry is explicit (`entry: ['src/cli.tsx']`, `apps/tui/tsup.config.ts`) — stories/fixtures can
  never leak into the published bundle; keep them under `storybook/` (outside `src/`) so tsup and
  the `src/**/*.test.*` vitest globs stay untouched, and confirm `tsconfig.json` vs
  `tsconfig.build.json` includes during implementation.

## 5. Size × skin matrix

Proposed config, exported from one module so generator, stories, and drift tests share it:

```ts
export const SIZES = [
  { id: 'narrow', columns: 80, rows: 24 },
  { id: 'standard', columns: 100, rows: 30 }, // golden 'standard' tier (P12-123)
  { id: 'wide', columns: 140, rows: 40 }, // golden 'wide' tier — SplitPane two-column
  { id: 'ultrawide', columns: 200, rows: 50 },
] as const;
export const SKINS = ['rich', 'plain'] as const; // plain = non-Kitty fallback (hard rule)
```

80×24 is the classic floor; 100×30/140×40 match the existing golden tiers so stories and goldens
show the _same_ frames; 200×50 exercises the wide layout. A "size config" becomes story data two
ways, both supported by the fixture-text approach: (1) one CSF story per (story × size × skin),
generated by a small loop in each `*.stories.tsx` (explicit, greppable, screenshot-stable); (2) one
story per component with `size`/`skin` as toolbar globals — prettier for browsing, worse for
diffing. Pick (1); a per-story `parameters.terminal = { columns, rows, skin }` documents the axis
either way. The kitty-graphics axis (image protocol) is orthogonal: it concerns
`@patches/terminal-media` payloads, not glyph fallback — plain skin is the fallback story the hard
rule requires, and `mise run spike`/VHS already cover real kitty rendering by hand.

## 6. Visual regression for TUI: text-frame diffing (not screenshots)

**Recommended: extend the existing golden-frame text diffing; do not screenshot the viewer.**
Justification:

- The frame _is_ the render. Ink's output is a string of cells; a byte-for-byte text diff captures
  100% of layout/glyph/color-code drift deterministically — no fonts, no GPU, no container pinning,
  no thresholds. A browser screenshot of the ansi-up viewer would instead test the _viewer's_ HTML
  conversion (and re-import every web flake mode from `storybook-web.md` §4) while adding zero TUI
  fidelity. The repo's own precedent (P12-123) chose text goldens for exactly this reason, keeping
  `capture.sh`'s real-terminal eyeball check as the manual complement.
- Mechanics already exist: `expect(frame).toBe(expected)` against committed fixtures with
  `UPDATE_GOLDEN=1`-style regeneration, plus `stripSgr` when color-independence is wanted (keep SGR
  in one variant so theme drift is also caught). Vitest `toMatchFileSnapshot` is an equivalent
  built-in if new fixtures prefer it; the hand-rolled golden files are already the established
  convention.
- The same generated fixtures serve both masters: the drift test diffs them, the storybook instance
  displays them — one source of truth, two consumers.

## 7. Additive-only guarantees

- The ~60 existing `ink-testing-library` tests (`renderApp` harness, screen tests, e2ee screens)
  remain the **source of behavioral truth**; nothing about them changes.
- Stories/fixtures are **not required for CI green in phase 1**: `pnpm test` globs stay
  `src/**/*.test.*` + `test/**/*.test.*`; frame drift checks (if added in phase 3) run as a separate,
  non-required workflow outside the `ci-ok` aggregation (see `docs/operations/ci.md` — `ci-ok` is
  the single required check, so a separate workflow is non-required by construction).
- Existing golden tests keep their tiers and fixtures untouched; new-matrix fixtures are additive
  files.

## Recommendation: GO — custom frame-fixture catalog + text golden diffs (no Storybook Ink renderer exists to adopt)

Biggest risk is self-inflicted scope, not tooling: the machinery is proven (§3), so the estimate
hinges on how many components/fixtures get cataloged. Second risk: frame-fixture drift noise from
nondeterminism (clocks, fake-API state) — fully solved by reusing the golden tests' determinism
rules verbatim rather than inventing new ones.

### Implementation plan

- **Phase 1 — generator + viewer skeleton (≈1.5–2 days).** In `apps/tui`: add devDeps
  (`storybook@10.5.10`, `@storybook/react-vite`, `react-dom`, `@types/react-dom`, `vite`, `ansi-up`)
  via `pnpm add --filter @patches/tui --save-dev …` (CLI `storybook init` inside `apps/tui` with
  `--type react_project` is the documented alternative; not executed during this read-only research
  pass). Write `scripts/render-frames.ts` (matrix loop over `renderInWindow` + `PlainModeProvider`,
  `FORCE_COLOR=3`, frozen Date, seeded fake world — cribbed from `test/golden.test.tsx`) emitting
  `storybook/frames/**.txt`; add `.storybook/{main.ts,preview.ts}` + `storybook/*.stories.tsx`
  displaying frames via `ansi-up` (per §5 shape (1)); scripts `storybook`, `build-storybook`,
  `frames:render`. Catalog 5 representative components: `PostRow`, `Nameplate`, `Toast`,
  `CommandPalette`, `SplitPane` (the width-sensitive set). Acceptance: `mise run check tui` green,
  `pnpm --filter @patches/tui build` output byte-identical to before (tsup entry untouched),
  existing vitest suite untouched, frames regenerate deterministically twice in a row.
- **Phase 2 — matrix as parameters (≈½ day).** Land `SIZES`/`SKINS` from §5 as the shared config;
  add theme variants (the TUI's own theme presets as a third axis) and per-story
  `parameters.terminal`; document the workflow in `apps/tui` README next to `UPDATE_GOLDEN`.
- **Phase 3 — drift checks, non-required (≈½–1 day).** A vitest file asserting each committed frame
  against a fresh render (same shape as `golden.test.tsx`, new fixtures only); wire into a separate
  non-required CI workflow; decide after a month whether to promote (mirrors `storybook-web.md`
  phase 3). Optionally publish the built storybook-static as a Pages preview alongside the VHS
  demos.

Effort total: ≈2.5–3 days.

<!-- Sources:
     Renderers: npm registry 404s (storybook-ink, ink-storybook, @storybook-ink/renderer,
       storybook-terminal) + DuckDuckGo search "storybook renderer ink react terminal CLI components",
       2026-08-26; Storybook framework list https://storybook.js.org/docs/get-started/install
     Width experiment: /tmp/opencode/ink-width-experiment.mts, run 2026-08-26 with
       FORCE_COLOR=3 pnpm exec tsx (output quoted in §3)
     Ink resize behavior: node_modules/.pnpm/ink@7.1.1_*/node_modules/ink/build/ink.js
       (resolveInteractiveOption, stdout.on('resize') guard), read 2026-08-26
     ansi-up 1.0.0 / xterm 5.3.0: pnpm view, 2026-08-26
     Local reads: apps/tui/{package.json,vitest.config.ts,tsup.config.ts,test/window.tsx,
       test/golden.test.tsx,test/ansi.ts,test/setup-terminal.ts,scripts/capture.sh,
       src/components/ProgressBar.tsx,src/components/ProgressBar.test.tsx},
       pnpm-workspace.yaml, mise.toml, docs/operations/ci.md -->

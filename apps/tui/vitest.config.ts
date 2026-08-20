import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'tui',
    environment: 'node',
    globals: false,
    // Scoped to src+test on purpose: without it, compiled copies in dist/ get
    // collected too and every test runs twice. `test/` holds the shared
    // `renderApp` harness (B-015) and the screen-level snapshot tests built on it.
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
    // Ink-testing-library snapshot tests drive real setTimeout-based `flush()` waits
    // (harness.tsx) against real Ink render trees; running every test *file* in this
    // project fully in parallel put enough CPU/timer contention on this machine that
    // an occasional `flush()` fired before a state update had actually committed,
    // failing an assertion that is otherwise deterministic (see LEARNINGS). No other
    // package in this repo drives Ink at all, so serializing just this project's
    // files is a narrow, low-cost fix rather than a blanket `fileParallelism: false`.
    fileParallelism: false,
    // Chalk (inside Ink) decides colour from the *host* environment, so a developer
    // whose shell exports FORCE_COLOR gets frames full of SGR sequences while CI gets
    // none, and any assertion over raw frame text passes on one machine and fails on
    // the other. Pin it to truecolor — the mode the real TUI runs in — so tests
    // exercise the styled render path everywhere. Assertions about *characters* must
    // strip SGR first: use `stripSgr` from `test/ansi.ts`.
    env: { FORCE_COLOR: '3' },
    // Ink reads its layout width from the host terminal, which is `undefined` in any
    // non-TTY shell and makes it lay out at width 0 — see test/setup-terminal.ts.
    setupFiles: ['./test/setup-terminal.ts'],
  },
});

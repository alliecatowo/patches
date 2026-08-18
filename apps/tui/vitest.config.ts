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
  },
});

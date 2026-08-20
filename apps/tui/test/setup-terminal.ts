/**
 * Pins a terminal size for every test in this project, for the same reason
 * `vitest.config.ts` pins `FORCE_COLOR`: Ink reads its layout width from the *host*
 * environment, so a frame assertion silently depends on how the suite was launched.
 *
 * When `process.stdout.columns` is `undefined` — which it is in any non-TTY shell, i.e.
 * CI and every agent shell — Ink lays out at width 0. A `<Text wrap="truncate-end">`
 * then truncates to the empty string and the row renders blank, so an assertion like
 * `expect(frame).toContain('Uploading photo.png… 42%')` fails against a frame that is
 * nothing but newlines. `ProgressBar.test.tsx` hit exactly this.
 *
 * It was invisible until now only because `fileParallelism: false` shares one process
 * across the whole project, and some earlier test file happened to set `columns` before
 * these ran — so the suite passed as a whole and failed the moment file order changed or
 * a single file was run on its own. Pinning it here removes the order dependence.
 *
 * 100x30 matches `ink-testing-library`'s own default width and comfortably clears the
 * TUI's documented minimum terminal size.
 */
process.stdout.columns = 100;
process.stdout.rows = 30;

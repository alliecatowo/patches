/** DECTCEM "show cursor". */
const SHOW_CURSOR = '\u001B[?25h';

let installed = false;

/**
 * Guarantee the user's terminal is usable after Patches exits (spec §70).
 *
 * Ink restores the alternate screen itself, but it treats teardown-time writes
 * as disposable, so the cursor reset has to be written straight to
 * `process.stdout` from an `exit`/signal handler rather than from a React effect
 * cleanup (docs/research/ink-kitty-graphics.md §4).
 *
 * Returns a function that runs the cleanup immediately, for callers that need to
 * tidy up before doing their own output.
 */
export function installTerminalCleanup(): () => void {
  const restore = (): void => {
    if (process.stdout.isTTY) process.stdout.write(SHOW_CURSOR);
  };

  if (!installed) {
    installed = true;
    process.on('exit', restore);
    // SIGTERM has no default Node handler that runs `exit` listeners, so it is
    // converted into a normal exit explicitly. SIGINT is left to Ink, which owns
    // Ctrl+C via `exitOnCtrlC`.
    process.on('SIGTERM', () => {
      restore();
      process.exit(0);
    });
  }

  return restore;
}

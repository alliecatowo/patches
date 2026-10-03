/** DECTCEM "show cursor". */
const SHOW_CURSOR = '\u001B[?25h';

let installed = false;

/** One-line, stack-free description of an unexpected failure (spec: never show a stack trace). */
export function describeCrash(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const firstLine = message.split('\n')[0]?.trim() ?? '';
  return `patches: unexpected error${firstLine === '' ? '' : `: ${firstLine}`}. Run \`patches doctor\` or re-run with --debug if it persists.`;
}

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
    const crash = (error: unknown): void => {
      restore();
      process.stderr.write(`${describeCrash(error)}\n`);
      process.exit(1);
    };
    process.on('uncaughtException', crash);
    process.on('unhandledRejection', crash);
    process.on('SIGTERM', () => {
      restore();
      process.exit(0);
    });
  }

  return restore;
}

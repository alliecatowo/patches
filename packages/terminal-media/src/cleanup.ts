/**
 * Process-level teardown for terminal images (spec §70: "On clean exit … clean inline
 * image placements").
 *
 * Deliberately NOT a React effect. Ink 7's alternate-screen teardown "treats
 * alternate-screen teardown output as disposable", so any delete sequence written during
 * unmount is thrown away and the images survive as terminal-side allocations for the rest
 * of the session. The correct order is: unmount (restores the main screen) -> releaseAll
 * (writes `a=d,d=I` to the real stdout) -> exit.
 */
import type { TerminalMediaRenderer } from './renderer.js';

export interface MediaCleanupOptions {
  /** Signals to intercept. Default: SIGINT, SIGTERM, SIGHUP. */
  signals?: readonly NodeJS.Signals[];
  /** Called before the images are released — pass Ink's `instance.unmount`. */
  onSignal?: () => void;
  /** Exit hook, overridable in tests. Default `process.exit`. */
  exit?: (code: number) => void;
  /** Process to attach to, overridable in tests. */
  proc?: NodeJS.Process;
}

const DEFAULT_SIGNALS: readonly NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];

/**
 * Install exit and signal handlers that free every image this renderer transmitted.
 *
 * @returns a disposer that removes the handlers (call it after a clean shutdown so the
 *   process can exit without a lingering listener).
 */
export function installMediaCleanup(
  renderer: TerminalMediaRenderer,
  options: MediaCleanupOptions = {},
): () => void {
  const {
    signals = DEFAULT_SIGNALS,
    onSignal,
    exit = (code: number) => process.exit(code),
    proc = process,
  } = options;

  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    renderer.releaseAll();
  };

  const onExit = (): void => {
    release();
  };
  proc.on('exit', onExit);

  const signalHandlers = signals.map((signal) => {
    const handler = (): void => {
      onSignal?.();
      release();
      exit(0);
    };
    proc.on(signal, handler);
    return [signal, handler] as const;
  });

  return () => {
    proc.off('exit', onExit);
    for (const [signal, handler] of signalHandlers) proc.off(signal, handler);
  };
}

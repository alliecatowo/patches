import { sanitizeText } from '@patches/domain';

import { getDiagnosticsReporter } from './reporter.js';
/**
 * Last-render capture for the issue reporter (B-112): tees everything the app writes
 * to stdout — which is exactly Ink's frame stream — into the diagnostics reporter's
 * frame slot, keeping a plain-text tail of the most recent render.
 *
 * This observes only; every write is forwarded untouched. ANSI escape sequences are
 * stripped on capture (the bundle wants readable text, and §172's sanitizer already
 * defines the one right way to strip them), so what lands in a report is the visible
 * text of the last frames.
 */

const CAPTURE_FLAG = Symbol('patches-frame-capture');

interface CapturableStream {
  write: (chunk: string | Uint8Array) => unknown;
}

/** Flush cadence: batch the lines of one render pass into a single frame update. */
const FLUSH_MS = 120;

export interface FrameCapture {
  /** Stops capturing and restores the stream's original `write`. */
  detach: () => void;
}

/**
 * Attaches capture to `stream` (idempotent — a second attach on the same stream is a
 * no-op returning the existing handle's shape). Writes are appended to a line buffer
 * that is folded into the reporter's frame tail on a short timer, so one render's many
 * small writes become one frame entry rather than dozens.
 */
export function attachFrameCapture(
  stream: CapturableStream,
  options: { reporter?: ReturnType<typeof getDiagnosticsReporter> } = {},
): FrameCapture {
  const target = stream as CapturableStream & { [CAPTURE_FLAG]?: FrameCapture };
  const reporter = options.reporter ?? getDiagnosticsReporter();
  if (target[CAPTURE_FLAG] !== undefined) return target[CAPTURE_FLAG];

  let pending = '';
  let buffer = '';
  let flushTimer: NodeJS.Timeout | undefined;

  function flush(): void {
    flushTimer = undefined;
    const text = buffer.trimEnd();
    buffer = '';
    if (text.length > 0) reporter.setFrame(sanitizeText(text, { multiline: true }));
  }

  const original = target.write.bind(target);
  target.write = (chunk: string | Uint8Array): unknown => {
    if (typeof chunk === 'string') {
      pending += chunk;
      // Only complete lines are folded in; a partial trailing chunk waits for its \n.
      const lastNewline = pending.lastIndexOf('\n');
      if (lastNewline >= 0) {
        buffer += pending.slice(0, lastNewline + 1);
        pending = pending.slice(lastNewline + 1);
        flushTimer ??= setTimeout(flush, FLUSH_MS);
      }
    }
    return original(chunk);
  };

  const handle: FrameCapture = {
    detach: () => {
      if (flushTimer !== undefined) clearTimeout(flushTimer);
      if (target.write === undefined) return;
      target.write = original;
      delete target[CAPTURE_FLAG];
    },
  };
  target[CAPTURE_FLAG] = handle;
  return handle;
}

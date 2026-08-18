/**
 * Terminal graphics capability detection.
 *
 * MUST run before Ink's `render()`: Ink puts stdin into raw mode and consumes `data`,
 * so a probe started afterwards races Ink's key parser and delivers escape replies to
 * the app as garbage keystrokes (research doc §4).
 */
import { execFileSync } from 'node:child_process';

/** What the terminal can do, as far as we could establish before Ink took over stdin. */
export interface GraphicsCapabilities {
  /** True only when the terminal answered the `a=q` graphics query with `OK`. */
  kitty: boolean;
  /** Cell width in pixels, from `CSI 16 t`. Absent when the terminal did not answer. */
  cellWidthPx?: number;
  /** Cell height in pixels, from `CSI 16 t`. Absent when the terminal did not answer. */
  cellHeightPx?: number;
  /** Terminal width in cells. */
  columns: number;
  /** Terminal height in cells. */
  rows: number;
  /** Human-readable summary of what we detected, for logs and the `--report` flag. */
  termHint: string;
  /**
   * True only when `kitty` support was confirmed while running inside tmux with
   * `allow-passthrough` on (B-007). The renderer must then wrap every APC
   * transmission in tmux's DCS passthrough envelope (`wrapTmuxPassthrough`) — tmux
   * does not forward APC graphics codes to the outer terminal otherwise, even with
   * passthrough enabled, because they are not wrapped in the DCS envelope it looks
   * for. Absent (not `false`) outside tmux, so a plain object spread/`toMatchObject`
   * comparison against a non-tmux terminal's capabilities doesn't need to know this
   * field exists at all.
   */
  tmux?: boolean;
}

/** Minimal structural shape of the input stream the probe needs. */
export interface ProbeStdin {
  isTTY?: boolean;
  isRaw?: boolean;
  setRawMode?: (mode: boolean) => void;
  resume: () => unknown;
  pause: () => unknown;
  on: (event: 'data', listener: (chunk: Buffer | string) => void) => unknown;
  off: (event: 'data', listener: (chunk: Buffer | string) => void) => unknown;
}

/** Minimal structural shape of the output stream the probe needs. */
export interface ProbeStdout {
  isTTY?: boolean;
  columns?: number;
  rows?: number;
  write: (data: string) => unknown;
}

export interface DetectOptions {
  stdin?: ProbeStdin;
  stdout?: ProbeStdout;
  /** How long to wait for the DA1 reply that terminates the probe. Default 300ms. */
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  /** Override the tmux passthrough check (injected in tests; shells out to tmux otherwise). */
  tmuxPassthrough?: (env: NodeJS.ProcessEnv) => boolean;
}

/** `\x1b[16t` — "report cell size in pixels". Answer: `\x1b[6;<height>;<width>t`. */
export const CELL_SIZE_QUERY = '\x1b[16t';

/**
 * The kitty capability probe: a 1x1 RGB image query by id 31.
 *
 * kitty: "If you get back a response to the graphics query, the terminal emulator
 * supports the protocol; if you get back a response to the device attributes query
 * without a response to the graphics query, it does not."
 */
export const GRAPHICS_QUERY = '\x1b_Gi=31,s=1,v=1,a=q,t=d,f=24;AAAA\x1b\\';

/** `\x1b[c` — primary device attributes. Every terminal answers, so it bounds the wait. */
export const DA1_QUERY = '\x1b[c';

const ESC = '\x1b';
const GRAPHICS_REPLY = `${ESC}_Gi=31;`;
const GRAPHICS_OK = `${GRAPHICS_REPLY}OK`;
const DA1_PREFIX = `${ESC}[?`;
const CELL_SIZE_PREFIX = `${ESC}[6;`;

/**
 * These replies are matched by hand rather than with regular expressions: a pattern
 * containing a literal ESC is a control character in a regex (`no-control-regex`), and
 * scanning is just as short.
 */
function hasDa1Reply(buffer: string): boolean {
  for (let from = 0; ;) {
    const start = buffer.indexOf(DA1_PREFIX, from);
    if (start === -1) return false;
    for (let i = start + DA1_PREFIX.length; i < buffer.length; i++) {
      const char = buffer[i];
      if (char === 'c') return true;
      if (char === undefined || !(char === ';' || (char >= '0' && char <= '9'))) break;
    }
    from = start + DA1_PREFIX.length;
  }
}

/** `CSI 6 ; height ; width t` -> pixel size of one cell. */
function parseCellSizeReply(buffer: string): { heightPx: number; widthPx: number } | undefined {
  for (let from = 0; ;) {
    const start = buffer.indexOf(CELL_SIZE_PREFIX, from);
    if (start === -1) return undefined;
    const end = buffer.indexOf('t', start);
    if (end !== -1) {
      const parts = buffer.slice(start + CELL_SIZE_PREFIX.length, end).split(';');
      const [height, width] = parts;
      if (parts.length === 2 && isDigits(height) && isDigits(width)) {
        return { heightPx: Number.parseInt(height, 10), widthPx: Number.parseInt(width, 10) };
      }
    }
    from = start + CELL_SIZE_PREFIX.length;
  }
}

function isDigits(value: string | undefined): value is string {
  if (value === undefined || value.length === 0) return false;
  for (const char of value) if (char < '0' || char > '9') return false;
  return true;
}

/** Everything the probe could learn from the bytes the terminal sent back. */
export interface ProbeParseResult {
  /** The graphics query was answered with `OK`. */
  graphicsOk: boolean;
  /** The graphics query was answered with an error message (protocol present, query rejected). */
  graphicsError: boolean;
  /** Primary device attributes came back — nothing more is coming. */
  da1: boolean;
  cellWidthPx?: number;
  cellHeightPx?: number;
}

/**
 * Parse a (possibly partial) probe reply buffer. Pure — unit-tested with fake streams.
 *
 * The buffer is read as latin1 so byte offsets and string offsets agree; a stray UTF-8
 * sequence from a paste can never corrupt the escape-sequence matching that way.
 */
export function parseProbeResponse(buffer: string): ProbeParseResult {
  const graphicsOk = buffer.includes(GRAPHICS_OK);
  const cellSize = parseCellSizeReply(buffer);
  const result: ProbeParseResult = {
    graphicsOk,
    graphicsError: !graphicsOk && buffer.includes(GRAPHICS_REPLY),
    da1: hasDa1Reply(buffer),
  };
  if (cellSize !== undefined && cellSize.heightPx > 0) result.cellHeightPx = cellSize.heightPx;
  if (cellSize !== undefined && cellSize.widthPx > 0) result.cellWidthPx = cellSize.widthPx;
  return result;
}

/**
 * Env-only hint. A fast path and a log label — never the sole signal, because
 * `TERM=xterm-kitty` survives an ssh hop into a terminal that has no graphics at all.
 */
export function looksGraphicsCapable(env: NodeJS.ProcessEnv = process.env): boolean {
  const term = env['TERM'] ?? '';
  return (
    /kitty|ghostty/i.test(term) ||
    env['TERM_PROGRAM'] === 'ghostty' ||
    env['TERM_PROGRAM'] === 'WezTerm' ||
    env['KITTY_WINDOW_ID'] !== undefined ||
    env['GHOSTTY_RESOURCES_DIR'] !== undefined
  );
}

/** A short label naming the terminal we think we are talking to. */
export function terminalHint(env: NodeJS.ProcessEnv = process.env): string {
  const term = env['TERM'] ?? 'unknown';
  const program = env['TERM_PROGRAM'];
  if (env['TMUX'] !== undefined) return `tmux (TERM=${term})`;
  if (env['GHOSTTY_RESOURCES_DIR'] !== undefined || program === 'ghostty') {
    return `ghostty ${env['TERM_PROGRAM_VERSION'] ?? ''}`.trim();
  }
  if (env['KITTY_WINDOW_ID'] !== undefined || /kitty/i.test(term)) return 'kitty';
  if (program !== undefined) return `${program} (TERM=${term})`;
  return `TERM=${term}`;
}

/**
 * Is tmux configured to forward APC sequences?
 *
 * tmux swallows APC unless `allow-passthrough` is on, and even then every sequence has
 * to be re-wrapped. We ask tmux directly rather than guessing; any failure means "no".
 */
export function tmuxAllowsPassthrough(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env['TMUX'] === undefined) return true; // not in tmux: nothing to allow
  try {
    const value = execFileSync('tmux', ['show-option', '-gqv', 'allow-passthrough'], {
      encoding: 'utf8',
      timeout: 250,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return value === 'on' || value === 'all';
  } catch {
    // tmux missing, not responding, or too old to know the option: assume no passthrough.
    return false;
  }
}

/**
 * Detect terminal graphics support.
 *
 * Never throws and never leaves stdin in raw mode: a non-TTY, a stream that refuses
 * `setRawMode`, or a silent terminal all resolve to `{kitty: false}`.
 */
export async function detectTerminalGraphics(
  options: DetectOptions = {},
): Promise<GraphicsCapabilities> {
  const {
    stdin = process.stdin,
    stdout = process.stdout,
    timeoutMs = 300,
    env = process.env,
    tmuxPassthrough = tmuxAllowsPassthrough,
  } = options;

  const columns = stdout.columns ?? 80;
  const rows = stdout.rows ?? 24;
  const hint = terminalHint(env);

  const unsupported = (reason: string): GraphicsCapabilities => ({
    kitty: false,
    columns,
    rows,
    termHint: `${hint} — ${reason}`,
  });

  if (stdout.isTTY !== true || stdin.isTTY !== true) return unsupported('not a tty');
  if (typeof stdin.setRawMode !== 'function') return unsupported('raw mode unavailable');
  if (env['TMUX'] !== undefined && !tmuxPassthrough(env)) {
    return unsupported('tmux without allow-passthrough');
  }

  const probe = await runProbe(stdin, stdout, timeoutMs);
  if (probe === undefined) return unsupported('probe failed');

  const capabilities: GraphicsCapabilities = {
    kitty: probe.graphicsOk,
    columns,
    rows,
    termHint: probe.graphicsOk
      ? hint
      : `${hint} — ${probe.da1 ? 'no graphics reply' : 'no reply before timeout'}`,
  };
  if (probe.cellWidthPx !== undefined) capabilities.cellWidthPx = probe.cellWidthPx;
  if (probe.cellHeightPx !== undefined) capabilities.cellHeightPx = probe.cellHeightPx;
  // Reaching here while `env['TMUX']` is set means the earlier gate already confirmed
  // `tmuxPassthrough(env)` — see the `return unsupported(...)` above.
  if (env['TMUX'] !== undefined && probe.graphicsOk) capabilities.tmux = true;
  return capabilities;
}

/**
 * Write the three queries and collect stdin until DA1 comes back or we time out.
 *
 * Returns `undefined` if raw mode could not be entered at all.
 */
async function runProbe(
  stdin: ProbeStdin,
  stdout: ProbeStdout,
  timeoutMs: number,
): Promise<ProbeParseResult | undefined> {
  const wasRaw = stdin.isRaw ?? false;
  try {
    stdin.setRawMode?.(true);
  } catch {
    // Some pipes and CI ptys expose setRawMode but reject it; treat as no graphics.
    return undefined;
  }
  stdin.resume();

  return await new Promise<ProbeParseResult>((resolve) => {
    let buffer = '';
    let settled = false;

    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stdin.off('data', onData);
      try {
        stdin.setRawMode?.(wasRaw);
      } catch {
        // Restoring raw mode is best-effort; the process is exiting either way.
      }
      stdin.pause();
      resolve(parseProbeResponse(buffer));
    };

    const onData = (chunk: Buffer | string): void => {
      buffer += typeof chunk === 'string' ? chunk : chunk.toString('latin1');
      // DA1 is emitted last, so its arrival means every earlier answer is already in.
      if (hasDa1Reply(buffer)) finish();
    };

    const timer = setTimeout(finish, timeoutMs);
    // `unref` so a probe against a stream that never answers cannot hold the event loop.
    timer.unref();

    stdin.on('data', onData);
    stdout.write(CELL_SIZE_QUERY + GRAPHICS_QUERY + DA1_QUERY);
  });
}

import {
  buildDiagnosticsBundle,
  toIsoTimestamp,
  type DiagnosticsBundle,
  type DiagnosticsBundleInput,
  type DiagnosticsBreadcrumbInput,
  type DiagnosticsEventInput,
} from '@patches/domain';

import { TUI_VERSION } from '../version.js';

/**
 * The TUI's beta-issue-reporter feed (B-112). One process-wide ring buffer of
 * breadcrumbs and structured events, plus the last rendered frame.
 *
 * §194 discipline is enforced by the *shapes* accepted here, not by callers being
 * careful: `recordRpcFailure` takes an RPC name and a numeric status code only, so a
 * DM body or a server error message has no parameter it could arrive through. Free
 * text exists solely in navigation breadcrumbs (screen names) and the frame capture,
 * all of which `buildDiagnosticsBundle` redacts again at build time.
 */

/** Ring capacity mirrors the bundle schema's caps (`MAX_DIAGNOSTICS_*`). */
const RING_CAPACITY = 100;

/** Kept tail of the captured render text, in characters. */
export const FRAME_TAIL_CHARS = 24_000;

export class DiagnosticsReporter {
  readonly #startedAt = new Date();
  #breadcrumbs: DiagnosticsBreadcrumbInput[] = [];
  #events: DiagnosticsEventInput[] = [];
  #capabilities: Record<string, boolean> = {};
  #frame = '';

  /** Boot breadcrumb — every report can show when this session started. */
  constructor() {
    this.recordBreadcrumb('boot', 'session started');
  }

  /** Metadata-grade breadcrumb (screen names, connection state changes). */
  recordBreadcrumb(kind: string, detail: string): void {
    this.#breadcrumbs.push({ at: new Date(), kind, detail });
    if (this.#breadcrumbs.length > RING_CAPACITY) {
      this.#breadcrumbs = this.#breadcrumbs.slice(this.#breadcrumbs.length - RING_CAPACITY);
    }
  }

  /**
   * An RPC failed. Status-code grade by construction: RPC name + numeric code (+ the
   * Connect code's enum name, a compile-time constant). Never the message.
   */
  recordRpcFailure(rpc: string, code: number, codeName: string): void {
    this.#events.push({
      at: new Date(),
      message: `rpc ${rpc} failed: ${codeName}(${String(code)})`,
    });
    if (this.#events.length > RING_CAPACITY) {
      this.#events = this.#events.slice(this.#events.length - RING_CAPACITY);
    }
  }

  /** A metadata-grade structured log line (connection retries, capability probes). */
  recordEvent(message: string): void {
    this.#events.push({ at: new Date(), message });
    if (this.#events.length > RING_CAPACITY) {
      this.#events = this.#events.slice(this.#events.length - RING_CAPACITY);
    }
  }

  /**
   * Replaces the retained render-text tail. Called on a throttled cadence by the frame
   * capture (`frame-capture.ts`); the newest complete tail wins.
   */
  setFrame(text: string): void {
    this.#frame = text.length <= FRAME_TAIL_CHARS ? text : text.slice(-FRAME_TAIL_CHARS);
  }

  setCapabilities(capabilities: Record<string, boolean>): void {
    this.#capabilities = { ...this.#capabilities, ...capabilities };
  }

  snapshot(): {
    input: Omit<DiagnosticsBundleInput, 'app' | 'nodeDomain'>;
    startedAt: string;
  } {
    return {
      startedAt: toIsoTimestamp(this.#startedAt),
      input: {
        version: TUI_VERSION,
        buildSha: process.env['PATCHES_BUILD_SHA'] ?? '',
        sessionHandle: '',
        capabilities: { ...this.#capabilities },
        breadcrumbs: [...this.#breadcrumbs],
        events: [...this.#events],
        ...(this.#frame === '' ? {} : { frame: this.#frame }),
      },
    };
  }
}

let singleton: DiagnosticsReporter | undefined;

/**
 * The process-wide reporter. A singleton deliberately: the API client seam records
 * failures from deep inside `PatchesApi`, the shell records breadcrumbs from wherever
 * navigation happens, and neither should have to thread a reporter through dozens of
 * components that are otherwise uninvolved.
 */
export function getDiagnosticsReporter(): DiagnosticsReporter {
  singleton ??= new DiagnosticsReporter();
  return singleton;
}

/** Test seam — resets the singleton so suites don't observe each other's rings. */
export function resetDiagnosticsReporterForTests(): void {
  singleton = undefined;
}

/** Assembles the final redacted bundle for submission (B-113 schema). */
export function buildTuiDiagnosticsBundle(options: {
  nodeDomain: string;
  sessionHandle?: string | undefined;
  notes?: string | undefined;
}): DiagnosticsBundle {
  const reporter = getDiagnosticsReporter();
  const { input } = reporter.snapshot();
  return buildDiagnosticsBundle({
    ...input,
    app: 'tui',
    nodeDomain: options.nodeDomain,
    ...(options.sessionHandle === undefined ? {} : { sessionHandle: options.sessionHandle }),
    ...(options.notes === undefined ? {} : { notes: options.notes }),
  });
}

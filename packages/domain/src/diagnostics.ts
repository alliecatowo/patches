import { z } from 'zod';

import { sanitizeText, utf8ByteLength } from './sanitize.js';

/**
 * The beta issue reporter's diagnostics bundle (B-112/B-113) — the one schema both
 * clients (`apps/tui`, `apps/web`) serialize and the issues-ingest Worker relays to
 * GitHub. Redaction is applied HERE, at build time, before the bundle ever leaves the
 * process (spec §194 discipline: no tokens/key material/DM bodies in any diagnostic):
 *
 * - clients feed only **metadata-grade** lines into `events` (RPC names + status codes,
 *   never message bodies — DM/plaintext bodies cannot enter by construction because no
 *   feeder accepts them), and this module additionally scrubs anything that *looks* like
 *   a secret out of every free-text field;
 * - every string is sanitized (`sanitizeText`) so escape sequences/control bytes/
 *   bidi trickery cannot ride along;
 * - the serialized bundle is capped at {@link MAX_DIAGNOSTICS_BUNDLE_BYTES} post-redaction
 *   (256 KiB) by dropping the oldest events first, then the frame, then the screenshot.
 */

export const DIAGNOSTICS_BUNDLE_SCHEMA_VERSION = 1;

export type DiagnosticsApp = 'tui' | 'web';

/** Breadcrumbs retained per bundle — oldest are dropped first beyond this. */
export const MAX_DIAGNOSTICS_BREADCRUMBS = 100;
/** Free-text bound on one breadcrumb's `detail`. */
export const DIAGNOSTICS_BREADCRUMB_DETAIL_MAX_CHARS = 200;
/** Structured log lines retained per bundle — oldest are dropped first beyond this. */
export const MAX_DIAGNOSTICS_EVENTS = 100;
/** Free-text bound on one structured log line. */
export const DIAGNOSTICS_EVENT_MAX_CHARS = 300;
/** Capability flags carried per bundle (hard cap; excess entries are dropped). */
export const MAX_DIAGNOSTICS_CAPABILITIES = 64;
/** Post-redaction ceiling on the whole serialized bundle. */
export const MAX_DIAGNOSTICS_BUNDLE_BYTES = 256 * 1024;
/** Last-Ink-frame capture tail, in characters (kept from the end of the render). */
export const DIAGNOSTICS_FRAME_TAIL_MAX_CHARS = 24_000;
/** A screenshot rides along only as a `data:image/png;base64,…` URL under this size. */
export const DIAGNOSTICS_SCREENSHOT_MAX_CHARS = 200_000;
/** Optional reporter notes (the client's own context, distinct from the user description). */
export const DIAGNOSTICS_NOTES_MAX_CHARS = 2_000;

/* --- redaction ------------------------------------------------------------- */

/** PEM private-key blocks (everything between the BEGIN/END markers, markers included). */
const PRIVATE_KEY_BLOCK =
  /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----[\s\S]*?(?:-----END(?: [A-Z0-9]+)* PRIVATE KEY-----|$)/g;

/** JSON Web Tokens — three base64url segments, the first always starting `eyJ` (`{"`). */
const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

/** `Authorization: Bearer …` / `Bearer …` credential schemes. */
const BEARER_CREDENTIAL = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;

/** Well-known provider token shapes (OpenAI-style `sk-…`, GitHub `ghp_…`/`github_pat_…`,
 * AWS access keys, Slack `xox…-…`). */
const PROVIDER_TOKENS =
  /\b(?:sk|rk|pk)-[A-Za-z0-9_-]{16,}\b|\bgh[pousr]_[A-Za-z0-9]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{22,}\b|\bAKIA[0-9A-Z]{16}\b|\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g;

/**
 * Assignment-shaped secrets: `<anything containing a secret-ish keyword> :|= <rest of
 * line>`, tolerating JSON-style quoting around key and separator. Keywords are
 * deliberately specific — "auth" alone would eat "author" — and the value extends to
 * end-of-line so multi-word credentials (`Bearer x.y.z`) never leave a half-redacted
 * tail behind.
 */
const SECRET_ASSIGNMENT =
  /([A-Za-z0-9_.-]*(?:password|passwd|secret|token|api[-_]key|access[-_]key|private[-_]key|authorization|credential|cookie)[A-Za-z0-9_.-]*)(["']?\s*[:=]\s*)[^\n]*/gi;

/** Any bare run of 40+ hex digits — a full git SHA at best, key material at worst. */
const LONG_HEX_RUN = /\b[A-Fa-f0-9]{40,}\b/g;

const REPLACEMENT = '[REDACTED]';

/**
 * The one redaction transform applied to every free-text bundle field: terminal-safety
 * sanitization first (so crafted escape sequences cannot split the patterns below), then
 * secret-pattern scrubbing. Never throws; over-redacts on purpose.
 */
export function redactDiagnosticsText(value: string): string {
  let text = sanitizeText(value, { multiline: true });
  if (text.length === 0) return '';
  text = text.replace(PRIVATE_KEY_BLOCK, REPLACEMENT);
  text = text.replace(JWT, '[REDACTED_JWT]');
  text = text.replace(PROVIDER_TOKENS, REPLACEMENT);
  text = text.replace(LONG_HEX_RUN, REPLACEMENT);
  text = text.replace(SECRET_ASSIGNMENT, '$1$2[REDACTED]');
  text = text.replace(BEARER_CREDENTIAL, 'Bearer [REDACTED]');
  return text;
}

function redactBounded(value: string, maxChars: number): string {
  return redactDiagnosticsText(value).slice(0, maxChars);
}

/* --- schema ---------------------------------------------------------------- */

/** ISO-8601 timestamp; unparseable inputs normalize to the epoch rather than throwing. */
export function toIsoTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return (Number.isNaN(date.getTime()) ? new Date(0) : date).toISOString();
}

function timestampSchema() {
  return z.union([z.date(), z.string()]).transform(toIsoTimestamp).pipe(z.string());
}

function boundedLineSchema(maxChars: number) {
  return z
    .string()
    .transform((value) => redactDiagnosticsText(value))
    .pipe(z.string().max(maxChars));
}

export const diagnosticsBreadcrumbSchema = z
  .object({
    at: timestampSchema(),
    kind: boundedLineSchema(60),
    detail: boundedLineSchema(DIAGNOSTICS_BREADCRUMB_DETAIL_MAX_CHARS),
  })
  .strict();

export const diagnosticsEventSchema = z
  .object({
    at: timestampSchema(),
    /** Metadata-grade structured log line — RPC name + status code grade, never a body. */
    message: boundedLineSchema(DIAGNOSTICS_EVENT_MAX_CHARS),
  })
  .strict();

export const diagnosticsBundleSchema = z
  .object({
    schemaVersion: z.literal(DIAGNOSTICS_BUNDLE_SCHEMA_VERSION),
    app: z.enum(['tui', 'web']),
    version: boundedLineSchema(100),
    buildSha: boundedLineSchema(64),
    nodeDomain: boundedLineSchema(253),
    /** Empty unless the reporter explicitly opted into attaching their handle. */
    sessionHandle: boundedLineSchema(100),
    capabilities: z.record(z.string().max(60), z.boolean()),
    breadcrumbs: z.array(diagnosticsBreadcrumbSchema).max(MAX_DIAGNOSTICS_BREADCRUMBS),
    events: z.array(diagnosticsEventSchema).max(MAX_DIAGNOSTICS_EVENTS),
    frame: z
      .string()
      .transform((value) => redactDiagnosticsText(value.slice(-DIAGNOSTICS_FRAME_TAIL_MAX_CHARS)))
      .pipe(z.string())
      .optional(),
    screenshotDataUrl: z
      .string()
      .refine(
        (value) =>
          value.startsWith('data:image/png;base64,') &&
          value.length <= DIAGNOSTICS_SCREENSHOT_MAX_CHARS,
        { message: 'screenshot must be a size-guarded PNG data URL' },
      )
      .optional(),
    notes: boundedLineSchema(DIAGNOSTICS_NOTES_MAX_CHARS).optional(),
  })
  .strict()
  .refine((bundle) => Object.keys(bundle.capabilities).length <= MAX_DIAGNOSTICS_CAPABILITIES, {
    message: `at most ${String(MAX_DIAGNOSTICS_CAPABILITIES)} capability flags`,
  });

export type DiagnosticsBreadcrumb = z.infer<typeof diagnosticsBreadcrumbSchema>;
export type DiagnosticsEvent = z.infer<typeof diagnosticsEventSchema>;
export type DiagnosticsBundle = z.infer<typeof diagnosticsBundleSchema>;

/* --- build ----------------------------------------------------------------- */

export interface DiagnosticsBundleInput {
  readonly app: DiagnosticsApp;
  readonly version: string;
  readonly buildSha?: string | undefined;
  readonly nodeDomain: string;
  /** User handle — attached only when the reporter opted in; `''`/omitted otherwise. */
  readonly sessionHandle?: string | undefined;
  readonly capabilities?: Readonly<Record<string, boolean>> | undefined;
  readonly breadcrumbs?: readonly DiagnosticsBreadcrumbInput[] | undefined;
  readonly events?: readonly DiagnosticsEventInput[] | undefined;
  /** TUI only: the last rendered frame's plain text. */
  readonly frame?: string | undefined;
  /** Web only: user-granted display-media capture as a PNG data URL. */
  readonly screenshotDataUrl?: string | undefined;
  readonly notes?: string | undefined;
}

export interface DiagnosticsBreadcrumbInput {
  readonly at: Date | string;
  readonly kind: string;
  readonly detail: string;
}

export interface DiagnosticsEventInput {
  readonly at: Date | string;
  readonly message: string;
}

function lastItems<Item>(items: readonly Item[], max: number): Item[] {
  return items.length <= max ? [...items] : [...items.slice(items.length - max)];
}

function normalizedCapabilities(
  capabilities: Readonly<Record<string, boolean>> | undefined,
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  if (capabilities !== undefined) {
    for (const [name, value] of Object.entries(capabilities)) {
      if (typeof value !== 'boolean') continue;
      if (result[name] !== undefined || Object.keys(result).length >= MAX_DIAGNOSTICS_CAPABILITIES)
        break;
      result[name] = value;
    }
  }
  return result;
}

function serializedByteLength(bundle: DiagnosticsBundle): number {
  return utf8ByteLength(JSON.stringify(bundle));
}

/**
 * Enforces {@link MAX_DIAGNOSTICS_BUNDLE_BYTES} deterministically: drop oldest events
 * first, then the frame, then the screenshot; finally truncate `notes`. Every step keeps
 * the newest material — the most recent context is what makes a report useful. (With the
 * current per-field caps the event shed alone reaches fit in practice; the frame and
 * screenshot steps are defense-in-depth for future field growth.)
 */
function fitWithinBudget(bundle: DiagnosticsBundle): DiagnosticsBundle {
  let out = bundle;
  if (serializedByteLength(out) <= MAX_DIAGNOSTICS_BUNDLE_BYTES) return out;

  // 1. Drop the oldest events (halving steps: deterministic, and O(log n) reserializations).
  while (out.events.length > 0 && serializedByteLength(out) > MAX_DIAGNOSTICS_BUNDLE_BYTES) {
    out = { ...out, events: out.events.slice(Math.ceil(out.events.length / 2)) };
  }
  if (serializedByteLength(out) <= MAX_DIAGNOSTICS_BUNDLE_BYTES) return out;

  // 2. Drop the TUI frame.
  if (out.frame !== undefined) {
    out = { ...out, frame: undefined };
    if (serializedByteLength(out) <= MAX_DIAGNOSTICS_BUNDLE_BYTES) return out;
  }

  // 3. Drop the web screenshot.
  if (out.screenshotDataUrl !== undefined) {
    out = { ...out, screenshotDataUrl: undefined };
    if (serializedByteLength(out) <= MAX_DIAGNOSTICS_BUNDLE_BYTES) return out;
  }
  // 4. Truncate notes to whatever headroom remains, then drop them entirely if even a
  //    short note cannot fit. Byte-checked each step — char counts are not byte counts.
  let notes = out.notes;
  while (
    notes !== undefined &&
    serializedByteLength({ ...out, notes }) > MAX_DIAGNOSTICS_BUNDLE_BYTES &&
    notes.length > 0
  ) {
    const next = notes.slice(0, Math.max(0, Math.floor(notes.length * 0.8)));
    if (next === notes) {
      notes = undefined;
      break;
    }
    notes = next;
  }
  out =
    notes === undefined || notes.length === 0 ? { ...out, notes: undefined } : { ...out, notes };

  // 5. Last resort — shed breadcrumbs the same way events were shed. The base identity
  //    fields are individually bounded well below the cap, so this always terminates fit.
  while (out.breadcrumbs.length > 0 && serializedByteLength(out) > MAX_DIAGNOSTICS_BUNDLE_BYTES) {
    out = { ...out, breadcrumbs: out.breadcrumbs.slice(Math.ceil(out.breadcrumbs.length / 2)) };
  }
  return out;
}

/**
 * A screenshot rides along only when it is already a size-guarded PNG data URL (the web
 * client's canvas encoder guarantees both; anything else is dropped here rather than
 * failing the whole bundle). It is machine-generated base64 — deliberately *not* run
 * through secret-pattern redaction, which would corrupt base64 that happens to contain
 * an assignment-shaped substring.
 */
function guardedScreenshot(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value.startsWith('data:image/png;base64,') &&
    value.length <= DIAGNOSTICS_SCREENSHOT_MAX_CHARS
    ? value
    : undefined;
}

/**
 * Builds a validated, redacted, size-capped {@link DiagnosticsBundle} from client-side
 * input. This is the single construction path both clients use — nothing ships without
 * passing through here.
 */
export function buildDiagnosticsBundle(input: DiagnosticsBundleInput): DiagnosticsBundle {
  const screenshot = guardedScreenshot(input.screenshotDataUrl);
  const candidate: DiagnosticsBundle = {
    schemaVersion: DIAGNOSTICS_BUNDLE_SCHEMA_VERSION,
    app: input.app,
    version: redactBounded(input.version, 100),
    buildSha: redactBounded(input.buildSha ?? '', 64),
    nodeDomain: redactBounded(input.nodeDomain, 253),
    sessionHandle: redactBounded(input.sessionHandle ?? '', 100),
    capabilities: normalizedCapabilities(input.capabilities),
    breadcrumbs: lastItems(input.breadcrumbs ?? [], MAX_DIAGNOSTICS_BREADCRUMBS).map(
      (breadcrumb) => ({
        at: toIsoTimestamp(breadcrumb.at),
        kind: redactBounded(breadcrumb.kind, 60),
        detail: redactBounded(breadcrumb.detail, DIAGNOSTICS_BREADCRUMB_DETAIL_MAX_CHARS),
      }),
    ),
    events: lastItems(input.events ?? [], MAX_DIAGNOSTICS_EVENTS).map((event) => ({
      at: toIsoTimestamp(event.at),
      message: redactBounded(event.message, DIAGNOSTICS_EVENT_MAX_CHARS),
    })),
    ...(input.frame === undefined ? {} : { frame: input.frame }),
    ...(screenshot === undefined ? {} : { screenshotDataUrl: screenshot }),
    ...(input.notes === undefined ? {} : { notes: input.notes }),
  };

  const parsed = diagnosticsBundleSchema.safeParse(candidate);
  // The builder normalizes every field itself, so a parse failure means an internal bug —
  // surfaced loudly rather than shipped as a malformed bundle.
  if (!parsed.success) {
    throw new Error(`diagnostics bundle failed validation: ${parsed.error.message}`);
  }
  return fitWithinBudget(parsed.data);
}

/** Serializes a bundle for POSTing (and for the manual copy-out fallback file). */
export function serializeDiagnosticsBundle(bundle: DiagnosticsBundle): string {
  return JSON.stringify(bundle, null, 2);
}

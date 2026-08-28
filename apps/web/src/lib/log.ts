/**
 * Structured browser logging wrapper (B-141). The only file in `apps/web/src` allowed to
 * call `console.*` directly (enforced by `eslint.config.js`'s `no-console` override for this
 * app) — every other call site should go through `log()`/`logger()` instead of scattered
 * `console.log`/`console.warn`/`console.error` calls, so log shape and redaction stay
 * consistent across the app.
 *
 * Never pass a DM body, message text, or key/token material as `context` or `message` (§183.1,
 * §194) — this wrapper does not redact its input the way `diagnosticsReporter.ts` does for
 * breadcrumbs; it is a thin, sampled console shim, not a secret-scrubbing pipeline.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  readonly [key: string]: string | number | boolean | null | undefined;
}

export interface LogOptions {
  /** Fraction of calls at this level that are actually emitted, in [0, 1]. Errors and warnings
   * default to always-on (1); `debug`/`info` default to fully sampled out in production so a
   * busy render loop can log liberally without flooding the console. */
  readonly sampleRate?: number;
}

const LEVEL_CONSOLE_METHOD: Record<LogLevel, 'debug' | 'info' | 'warn' | 'error'> = {
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
};

const DEFAULT_SAMPLE_RATE: Record<LogLevel, number> = {
  debug: import.meta.env.DEV ? 1 : 0,
  info: import.meta.env.DEV ? 1 : 0,
  warn: 1,
  error: 1,
};

function shouldEmit(level: LogLevel, options?: LogOptions): boolean {
  const rate = options?.sampleRate ?? DEFAULT_SAMPLE_RATE[level];
  if (rate >= 1) return true;
  if (rate <= 0) return false;
  return Math.random() < rate;
}

function emit(level: LogLevel, message: string, context?: LogContext, options?: LogOptions): void {
  if (!shouldEmit(level, options)) return;
  const method = LEVEL_CONSOLE_METHOD[level];
  // `no-console` is disabled for this file specifically in eslint.config.js — this is the
  // one call site the whole app's structured-logging rule is meant to funnel through.
  if (context !== undefined) {
    console[method](`[${level}] ${message}`, context);
  } else {
    console[method](`[${level}] ${message}`);
  }
}

/** Log one line at a given level with an optional structured context object. Prefer `logger()`
 * for a call site that logs repeatedly with the same fixed context (e.g. a component name). */
export function log(
  level: LogLevel,
  message: string,
  context?: LogContext,
  options?: LogOptions,
): void {
  emit(level, message, context, options);
}

export interface Logger {
  debug(message: string, context?: LogContext, options?: LogOptions): void;
  info(message: string, context?: LogContext, options?: LogOptions): void;
  warn(message: string, context?: LogContext, options?: LogOptions): void;
  error(message: string, context?: LogContext, options?: LogOptions): void;
}

/** A logger bound to a fixed `scope` (e.g. a module or component name), merged into every
 * call's context under `scope`. */
export function logger(scope: string): Logger {
  const withScope = (context?: LogContext): LogContext => ({ ...context, scope });
  return {
    debug: (message, context, options) => emit('debug', message, withScope(context), options),
    info: (message, context, options) => emit('info', message, withScope(context), options),
    warn: (message, context, options) => emit('warn', message, withScope(context), options),
    error: (message, context, options) => emit('error', message, withScope(context), options),
  };
}

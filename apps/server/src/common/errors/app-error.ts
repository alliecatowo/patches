import { type ErrorCode } from './error-codes.js';

export interface AppErrorOptions {
  /** The underlying failure. Logged server-side, never sent to the client. */
  cause?: unknown;
  /**
   * Extra structured context for logs only. Must not contain secrets — it is
   * written to the log stream verbatim.
   */
  context?: Readonly<Record<string, unknown>>;
}

/**
 * The only error type application code should throw deliberately.
 *
 * `message` is client-visible, so it must be actionable and free of internals:
 * no stack traces, no SQL, no file paths (spec §57).
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly context: Readonly<Record<string, unknown>> | undefined;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.context = options.context;
  }

  static validation(message: string, options?: AppErrorOptions): AppError {
    return new AppError('VALIDATION_ERROR', message, options);
  }

  static internal(message = 'Something went wrong on our side.', options?: AppErrorOptions): AppError {
    return new AppError('INTERNAL_ERROR', message, options);
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

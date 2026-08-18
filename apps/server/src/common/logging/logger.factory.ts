import { ConsoleLogger, type LogLevel } from '@nestjs/common';

import { type Env } from '../../config/env.schema.js';

/**
 * Log levels ordered from least to most verbose. Setting `LOG_LEVEL=warn` enables
 * `warn` and `error` only.
 */
const LEVELS: readonly LogLevel[] = ['error', 'warn', 'log', 'debug', 'verbose'];

export function logLevelsFor(level: Env['LOG_LEVEL']): LogLevel[] {
  const index = LEVELS.indexOf(level);
  return [...LEVELS.slice(0, index === -1 ? 3 : index + 1)];
}

/**
 * Structured logs in production, human-readable in development (spec §98).
 *
 * Nest 11's `ConsoleLogger` emits newline-delimited JSON when `json: true`, which
 * is what Fly.io's log shipper wants; colours are disabled there because they
 * would corrupt the JSON payload.
 */
export function createLogger(env: Pick<Env, 'NODE_ENV' | 'LOG_LEVEL'>): ConsoleLogger {
  const json = env.NODE_ENV === 'production';
  return new ConsoleLogger({
    json,
    colors: !json,
    logLevels: logLevelsFor(env.LOG_LEVEL),
    timestamp: !json,
  });
}

import { ConsoleLogger, type LogLevel } from '@nestjs/common';

import { type Env } from '../config/env.schema.js';

/** Log levels ordered from least to most verbose. */
const LEVELS: readonly LogLevel[] = ['error', 'warn', 'log', 'debug', 'verbose'];

/**
 * `@patches/config`'s `LOG_LEVEL` vocabulary (`debug`/`info`/`warn`/`error`) maps onto
 * Nest's `ConsoleLogger` vocabulary (`error`/`warn`/`log`/`debug`/`verbose`) by enabling
 * every level at-or-above the requested one, same approach as `apps/server`.
 */
export function logLevelsFor(level: Env['LOG_LEVEL']): LogLevel[] {
  const index = level === 'debug' ? 3 : level === 'info' ? 2 : level === 'warn' ? 1 : 0;
  return [...LEVELS.slice(0, index + 1)];
}

/**
 * Structured logs in production, human-readable in development (spec §98). Nest 11's
 * `ConsoleLogger` emits newline-delimited JSON when `json: true`.
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

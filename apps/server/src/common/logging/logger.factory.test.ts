import { describe, expect, it } from 'vitest';

import { createLogger, logLevelsFor } from './logger.factory.js';

describe('logLevelsFor', () => {
  it('enables only error+warn+log at the default (error, warn, log) LOG_LEVEL', () => {
    expect(logLevelsFor('log')).toEqual(['error', 'warn', 'log']);
  });

  it('enables everything up to and including the requested level', () => {
    expect(logLevelsFor('error')).toEqual(['error']);
    expect(logLevelsFor('warn')).toEqual(['error', 'warn']);
    expect(logLevelsFor('debug')).toEqual(['error', 'warn', 'log', 'debug']);
    expect(logLevelsFor('verbose')).toEqual(['error', 'warn', 'log', 'debug', 'verbose']);
  });
});

describe('createLogger (spec §98)', () => {
  it('honours LOG_LEVEL — enabling only the requested and louder levels', () => {
    const logger = createLogger({ NODE_ENV: 'development', LOG_LEVEL: 'warn' });

    expect(logger.isLevelEnabled('error')).toBe(true);
    expect(logger.isLevelEnabled('warn')).toBe(true);
    expect(logger.isLevelEnabled('log')).toBe(false);
    expect(logger.isLevelEnabled('debug')).toBe(false);
  });

  it('enables verbose logging when LOG_LEVEL=verbose', () => {
    const logger = createLogger({ NODE_ENV: 'development', LOG_LEVEL: 'verbose' });
    expect(logger.isLevelEnabled('verbose')).toBe(true);
  });

  it('does not throw when logging in production (json) mode', () => {
    const logger = createLogger({ NODE_ENV: 'production', LOG_LEVEL: 'log' });
    expect(() => {
      logger.log('production log line');
    }).not.toThrow();
  });

  it('does not throw when logging in development (human-readable) mode', () => {
    const logger = createLogger({ NODE_ENV: 'development', LOG_LEVEL: 'debug' });
    expect(() => {
      logger.debug('dev log line');
    }).not.toThrow();
  });
});

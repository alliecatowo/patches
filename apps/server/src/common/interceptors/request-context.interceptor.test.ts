import { MIN_CLIENT_VERSION } from '@patches/proto';
import { describe, expect, it } from 'vitest';

import { AppError } from '../errors/app-error.js';
import { assertClientSupported } from './request-context.interceptor.js';

function codeOf(fn: () => void): string {
  try {
    fn();
  } catch (error) {
    return error instanceof AppError ? error.code : 'not-an-app-error';
  }
  return 'no-throw';
}

describe('assertClientSupported (spec §83)', () => {
  it('accepts the minimum supported version and anything newer', () => {
    expect(() => {
      assertClientSupported(MIN_CLIENT_VERSION);
    }).not.toThrow();
    expect(() => {
      assertClientSupported('99.0.0');
    }).not.toThrow();
    expect(() => {
      assertClientSupported('0.1.0-rc.1');
    }).not.toThrow();
  });

  it('rejects an impossibly old client', () => {
    expect(codeOf(() => {
      assertClientSupported('0.0.1');
    })).toBe('CLIENT_VERSION_UNSUPPORTED');
  });

  it('tells the user how to fix it instead of failing generically', () => {
    try {
      assertClientSupported('0.0.1');
      expect.unreachable('expected a rejection');
    } catch (error) {
      expect((error as AppError).message).toContain('too old');
      expect((error as AppError).message).toContain(MIN_CLIENT_VERSION);
      expect((error as AppError).message).toContain('npm install -g patches@latest');
    }
  });

  it('rejects a version string it cannot parse', () => {
    expect(codeOf(() => {
      assertClientSupported('banana');
    })).toBe('CLIENT_VERSION_UNSUPPORTED');
  });

  it('allows callers that send no version at all (grpcurl, health probes)', () => {
    expect(() => {
      assertClientSupported(undefined);
    }).not.toThrow();
  });
});

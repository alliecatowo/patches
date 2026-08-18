import { Metadata } from '@grpc/grpc-js';
import { MIN_CLIENT_VERSION } from '@patches/proto';
import { describe, expect, it } from 'vitest';

import { AppError } from '../errors/app-error.js';
import {
  assertClientSupported,
  sanitizeRequestId,
  stripPeerPort,
  proxiedPeer,
} from './request-context.interceptor.js';

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
    expect(
      codeOf(() => {
        assertClientSupported('0.0.1');
      }),
    ).toBe('CLIENT_VERSION_UNSUPPORTED');
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
    expect(
      codeOf(() => {
        assertClientSupported('banana');
      }),
    ).toBe('CLIENT_VERSION_UNSUPPORTED');
  });

  it('allows callers that send no version at all (grpcurl, health probes)', () => {
    expect(() => {
      assertClientSupported(undefined);
    }).not.toThrow();
  });
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('sanitizeRequestId (spec §103)', () => {
  it('accepts a well-formed id unchanged', () => {
    expect(sanitizeRequestId('abc-DEF_123.456')).toBe('abc-DEF_123.456');
  });

  it('accepts exactly 64 characters', () => {
    const id = 'a'.repeat(64);
    expect(sanitizeRequestId(id)).toBe(id);
  });

  it('generates a fresh id when none is supplied', () => {
    expect(sanitizeRequestId(undefined)).toMatch(UUID_RE);
  });

  it('replaces an id over 64 characters', () => {
    expect(sanitizeRequestId('a'.repeat(65))).toMatch(UUID_RE);
  });

  it('replaces an id with characters outside [A-Za-z0-9._-]', () => {
    for (const bad of ['has spaces', 'semi;colon', 'new\nline', '<script>', 'emoji-🙂']) {
      expect(sanitizeRequestId(bad)).toMatch(UUID_RE);
    }
  });

  it('replaces an empty string', () => {
    expect(sanitizeRequestId('')).toMatch(UUID_RE);
  });
});

describe('stripPeerPort (spec §102 — rate limiting needs a caller-independent key)', () => {
  it('strips the ephemeral port from an IPv4 peer', () => {
    expect(stripPeerPort('127.0.0.1:52341')).toBe('127.0.0.1');
  });

  it('strips the trailing port grpc-js appends to an unbracketed IPv6 address', () => {
    expect(stripPeerPort('::1:52341')).toBe('::1');
  });

  it('leaves a value with no discernible port unchanged', () => {
    expect(stripPeerPort('a-weird-peer-string')).toBe('a-weird-peer-string');
  });

  it('treats grpc-js’s own "unknown" and an empty string as no peer at all', () => {
    expect(stripPeerPort('unknown')).toBeUndefined();
    expect(stripPeerPort('')).toBeUndefined();
  });
});

describe('proxiedPeer (A-039)', () => {
  it('prefers fly-client-ip, then the first x-forwarded-for hop', () => {
    const fly = new Metadata();
    fly.set('fly-client-ip', '203.0.113.9');
    fly.set('x-forwarded-for', '198.51.100.1, 10.0.0.1');
    expect(proxiedPeer(fly)).toBe('203.0.113.9');

    const xff = new Metadata();
    xff.set('x-forwarded-for', ' 198.51.100.1 , 10.0.0.1');
    expect(proxiedPeer(xff)).toBe('198.51.100.1');
  });

  it('returns undefined without proxy headers so the socket peer is used', () => {
    expect(proxiedPeer(new Metadata())).toBeUndefined();
  });
});

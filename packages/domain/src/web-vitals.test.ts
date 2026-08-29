import { describe, expect, it } from 'vitest';

import {
  isKnownWebVitalsRoutePattern,
  pathToRoutePattern,
  webVitalsPayloadSchema,
  WEB_VITALS_MAX_SAMPLES_PER_PAYLOAD,
  WEB_VITALS_ROUTE_PATTERNS,
} from './web-vitals.js';

describe('pathToRoutePattern', () => {
  it('maps known static and parameterized routes without leaking the concrete segment', () => {
    expect(pathToRoutePattern('/')).toBe('/');
    expect(pathToRoutePattern('/search')).toBe('/search');
    expect(pathToRoutePattern('/p/abc123')).toBe('/p/:id');
    expect(pathToRoutePattern('/page/someone')).toBe('/page/:handle');
    expect(pathToRoutePattern('/page/someone/about')).toBe('/page/:handle/:slug');
    expect(pathToRoutePattern('/t/some-hashtag')).toBe('/t/:tag');
    expect(pathToRoutePattern('/c/community-id')).toBe('/c/:id');
    expect(pathToRoutePattern('/messages/thread-id')).toBe('/messages/:id');
    expect(pathToRoutePattern('/settings/profile')).toBe('/settings/:section');
  });

  it('falls back to :handle for a bare profile route, never the raw handle', () => {
    expect(pathToRoutePattern('/some-handle')).toBe('/:handle');
  });

  it('falls back to :unknown for anything unrecognized', () => {
    expect(pathToRoutePattern('/weird/nested/path')).toBe('/:unknown');
  });

  it('every possible output is a member of WEB_VITALS_ROUTE_PATTERNS', () => {
    for (const path of [
      '/',
      '/search',
      '/p/abc',
      '/page/someone',
      '/page/someone/about',
      '/t/tag',
      '/c/id',
      '/messages/id',
      '/settings/profile',
      '/handle',
      '/weird/nested/path',
    ]) {
      expect(WEB_VITALS_ROUTE_PATTERNS.has(pathToRoutePattern(path))).toBe(true);
    }
  });
});

describe('isKnownWebVitalsRoutePattern', () => {
  it('rejects an arbitrary/hostile route string, not just anything unmatched', () => {
    expect(isKnownWebVitalsRoutePattern('/p/actual-post-id-123')).toBe(false);
    expect(isKnownWebVitalsRoutePattern('/../../etc/passwd')).toBe(false);
    expect(isKnownWebVitalsRoutePattern('')).toBe(false);
  });

  it('accepts every canonical pattern', () => {
    for (const pattern of WEB_VITALS_ROUTE_PATTERNS) {
      expect(isKnownWebVitalsRoutePattern(pattern)).toBe(true);
    }
  });
});

describe('webVitalsPayloadSchema', () => {
  const validPayload = {
    route: '/p/:id',
    navigationType: 'navigate',
    buildVersion: '1.2.3',
    samples: [{ name: 'LCP', value: 900, rating: 'good', id: 'v1-1' }],
  };

  it('accepts a well-formed payload', () => {
    expect(webVitalsPayloadSchema.safeParse(validPayload).success).toBe(true);
  });

  it('rejects a route not on the canonical allow-list (cardinality guard)', () => {
    const result = webVitalsPayloadSchema.safeParse({
      ...validPayload,
      route: '/p/concrete-post-id-abc123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an oversized samples array', () => {
    const samples = Array.from({ length: WEB_VITALS_MAX_SAMPLES_PER_PAYLOAD + 1 }, (_, i) => ({
      name: 'CLS' as const,
      value: 0.1,
      rating: 'good' as const,
      id: `v1-${String(i)}`,
    }));
    const result = webVitalsPayloadSchema.safeParse({ ...validPayload, samples });
    expect(result.success).toBe(false);
  });

  it('rejects a non-finite or absurdly large metric value', () => {
    for (const value of [Number.POSITIVE_INFINITY, Number.NaN, -1, 1e300]) {
      const result = webVitalsPayloadSchema.safeParse({
        ...validPayload,
        samples: [{ name: 'LCP', value, rating: 'good', id: 'v1-1' }],
      });
      expect(result.success).toBe(false);
    }
  });

  it('rejects an oversized id/buildVersion string', () => {
    const longString = 'x'.repeat(500);
    expect(
      webVitalsPayloadSchema.safeParse({ ...validPayload, buildVersion: longString }).success,
    ).toBe(false);
    expect(
      webVitalsPayloadSchema.safeParse({
        ...validPayload,
        samples: [{ name: 'LCP', value: 1, rating: 'good', id: longString }],
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown metric name/rating/navigationType', () => {
    expect(
      webVitalsPayloadSchema.safeParse({ ...validPayload, navigationType: 'hostile' }).success,
    ).toBe(false);
    expect(
      webVitalsPayloadSchema.safeParse({
        ...validPayload,
        samples: [{ name: 'FID', value: 1, rating: 'good', id: 'v1-1' }],
      }).success,
    ).toBe(false);
    expect(
      webVitalsPayloadSchema.safeParse({
        ...validPayload,
        samples: [{ name: 'LCP', value: 1, rating: 'excellent', id: 'v1-1' }],
      }).success,
    ).toBe(false);
  });
});

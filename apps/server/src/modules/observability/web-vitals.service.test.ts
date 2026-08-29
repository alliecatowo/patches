import {
  metricsRegistry,
  webVitalsCls,
  webVitalsInpMs,
  webVitalsLcpMs,
} from '@patches/observability/metrics';
import { beforeEach, describe, expect, it } from 'vitest';

import { WebVitalsService } from './web-vitals.service.js';

const validPayload = {
  route: '/p/:id',
  navigationType: 'navigate',
  buildVersion: '1.2.3',
  samples: [
    { name: 'CLS', value: 0.05, rating: 'good', id: 'v1-1' },
    { name: 'INP', value: 120, rating: 'good', id: 'v1-2' },
    { name: 'LCP', value: 900, rating: 'good', id: 'v1-3' },
  ],
};

describe('WebVitalsService', () => {
  beforeEach(() => {
    webVitalsCls.reset();
    webVitalsInpMs.reset();
    webVitalsLcpMs.reset();
  });

  it('accepts a well-formed payload and folds every sample into the matching histogram', async () => {
    const service = new WebVitalsService();
    const outcome = service.ingestRawBody(JSON.stringify(validPayload));
    expect(outcome).toEqual({ accepted: true });

    const scrape = await metricsRegistry.metrics();
    expect(scrape).toMatch(/patches_web_vitals_cls_bucket\{le="0\.05",route="\/p\/:id"\} 1/);
    expect(scrape).toMatch(/patches_web_vitals_inp_ms_sum\{route="\/p\/:id"\} 120/);
    expect(scrape).toMatch(/patches_web_vitals_lcp_ms_sum\{route="\/p\/:id"\} 900/);
  });

  it('rejects malformed JSON without throwing or touching a metric', () => {
    const service = new WebVitalsService();
    const outcome = service.ingestRawBody('{not-json');
    expect(outcome).toEqual({ accepted: false, reason: 'malformed_json' });
  });

  it('rejects a route not on the shared allow-list (cardinality guard) and never labels a metric with it', async () => {
    const service = new WebVitalsService();
    const outcome = service.ingestRawBody(
      JSON.stringify({ ...validPayload, route: '/p/an-actual-post-id-12345' }),
    );
    expect(outcome).toEqual({ accepted: false, reason: 'invalid_payload' });

    const scrape = await metricsRegistry.metrics();
    expect(scrape).not.toContain('an-actual-post-id-12345');
  });

  it('rejects an oversized/hostile payload — huge samples array', () => {
    const service = new WebVitalsService();
    const samples = Array.from({ length: 500 }, (_, i) => ({
      name: 'CLS',
      value: 0.1,
      rating: 'good',
      id: `v1-${String(i)}`,
    }));
    const outcome = service.ingestRawBody(JSON.stringify({ ...validPayload, samples }));
    expect(outcome).toEqual({ accepted: false, reason: 'invalid_payload' });
  });

  it('rejects an oversized/hostile payload — absurd metric value and long strings', () => {
    const service = new WebVitalsService();
    const outcome = service.ingestRawBody(
      JSON.stringify({
        ...validPayload,
        buildVersion: 'x'.repeat(10_000),
        samples: [{ name: 'LCP', value: 1e300, rating: 'good', id: 'v1-1' }],
      }),
    );
    expect(outcome).toEqual({ accepted: false, reason: 'invalid_payload' });
  });
});

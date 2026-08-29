import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { browserSmokePlan, isLabOrigin } from './browser.js';

describe('browserSmokePlan', () => {
  it('rejects a non-loopback web origin', () => {
    expect(() =>
      browserSmokePlan({ webOrigin: 'https://patches.example.com', runDirectory: '/run' }),
    ).toThrow('loopback');
  });

  it('produces a deterministic-shaped plan with disposable account and screenshot path', () => {
    const plan = browserSmokePlan({ webOrigin: 'http://127.0.0.1:8088', runDirectory: '/run/lab' });
    expect(plan.handle).toMatch(/^wk-smoke-/u);
    expect(plan.email).toMatch(/@example\.invalid$/u);
    expect(plan.screenshotPath).toBe(join('/run/lab', 'smoke.png'));
    expect(plan.steps[0]).toBe('launch headless chromium');
    expect(plan.steps).toContain('compose a post');
    expect(plan.composedPostMarker).toBe('Smoke marker');
  });

  it('recognises only loopback origins as lab origins', () => {
    expect(isLabOrigin('http://127.0.0.1:8088')).toBe(true);
    expect(isLabOrigin('https://patches.example.com')).toBe(false);
  });
});

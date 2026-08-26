import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const onCLS = vi.fn();
const onINP = vi.fn();
const onLCP = vi.fn();

vi.mock('web-vitals', () => ({ onCLS, onINP, onLCP }));

describe('web vitals reporter', () => {
  beforeEach(() => {
    vi.resetModules();
    onCLS.mockReset();
    onINP.mockReset();
    onLCP.mockReset();
    vi.stubEnv('VITE_WEB_VITALS_ENDPOINT', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('pathToRoutePattern', () => {
    it('maps known static and parameterized routes without leaking the concrete segment', async () => {
      const { pathToRoutePattern } = await import('./webVitals.js');
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

    it('falls back to :handle for the bare profile route, never the raw handle', async () => {
      const { pathToRoutePattern } = await import('./webVitals.js');
      expect(pathToRoutePattern('/some-handle')).toBe('/:handle');
    });

    it('falls back to :unknown for anything unrecognized', async () => {
      const { pathToRoutePattern } = await import('./webVitals.js');
      expect(pathToRoutePattern('/weird/nested/path')).toBe('/:unknown');
    });
  });

  it('never installs the web-vitals observers when no endpoint is configured', async () => {
    const { initWebVitals } = await import('./webVitals.js');
    initWebVitals();
    expect(onCLS).not.toHaveBeenCalled();
    expect(onINP).not.toHaveBeenCalled();
    expect(onLCP).not.toHaveBeenCalled();
  });

  it('installs observers exactly once when an endpoint is configured', async () => {
    vi.stubEnv('VITE_WEB_VITALS_ENDPOINT', 'https://collect.example/vitals');
    const { initWebVitals } = await import('./webVitals.js');
    initWebVitals();
    initWebVitals();
    expect(onCLS).toHaveBeenCalledTimes(1);
    expect(onINP).toHaveBeenCalledTimes(1);
    expect(onLCP).toHaveBeenCalledTimes(1);
  });

  it('batches samples into one sendBeacon call on pagehide, carrying no PII', async () => {
    vi.stubEnv('VITE_WEB_VITALS_ENDPOINT', 'https://collect.example/vitals');
    const sendBeacon = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'sendBeacon', { value: sendBeacon, configurable: true });

    const { initWebVitals } = await import('./webVitals.js');
    initWebVitals();

    const clsHandler = onCLS.mock.calls[0]?.[0] as (metric: unknown) => void;
    const inpHandler = onINP.mock.calls[0]?.[0] as (metric: unknown) => void;
    const lcpHandler = onLCP.mock.calls[0]?.[0] as (metric: unknown) => void;
    clsHandler({
      name: 'CLS',
      value: 0.05,
      rating: 'good',
      id: 'v1-1',
      navigationType: 'navigate',
    });
    inpHandler({ name: 'INP', value: 120, rating: 'good', id: 'v1-2', navigationType: 'navigate' });
    lcpHandler({ name: 'LCP', value: 900, rating: 'good', id: 'v1-3', navigationType: 'navigate' });

    window.dispatchEvent(new Event('pagehide'));

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [url, blob] = sendBeacon.mock.calls[0] as [string, Blob];
    expect(url).toBe('https://collect.example/vitals');
    const body = JSON.parse(await blob.text()) as {
      route: string;
      samples: Array<{ name: string }>;
    };
    expect(body.samples).toHaveLength(3);
    expect(body.samples.map((s) => s.name).sort()).toEqual(['CLS', 'INP', 'LCP']);
    expect(JSON.stringify(body)).not.toMatch(/token|password|@/);

    // A second pagehide with nothing new buffered must not send an empty batch.
    window.dispatchEvent(new Event('pagehide'));
    expect(sendBeacon).toHaveBeenCalledTimes(1);
  });

  it('falls back to a keepalive fetch when sendBeacon is unavailable', async () => {
    vi.stubEnv('VITE_WEB_VITALS_ENDPOINT', 'https://collect.example/vitals');
    Object.defineProperty(navigator, 'sendBeacon', { value: undefined, configurable: true });
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    const { initWebVitals } = await import('./webVitals.js');
    initWebVitals();
    const clsHandler = onCLS.mock.calls[0]?.[0] as (metric: unknown) => void;
    clsHandler({
      name: 'CLS',
      value: 0.02,
      rating: 'good',
      id: 'v1-4',
      navigationType: 'navigate',
    });

    document.dispatchEvent(new Event('visibilitychange'));
    // jsdom's default visibilityState is 'visible'; force 'hidden' for this assertion.
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://collect.example/vitals');
    expect(init.keepalive).toBe(true);
  });

  it('degrades silently when sendBeacon throws and the fetch fallback rejects', async () => {
    vi.stubEnv('VITE_WEB_VITALS_ENDPOINT', 'https://collect.example/vitals');
    Object.defineProperty(navigator, 'sendBeacon', {
      value: vi.fn(() => {
        throw new Error('beacon queue full');
      }),
      configurable: true,
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const { initWebVitals } = await import('./webVitals.js');
    initWebVitals();
    const lcpHandler = onLCP.mock.calls[0]?.[0] as (metric: unknown) => void;
    lcpHandler({
      name: 'LCP',
      value: 1200,
      rating: 'poor',
      id: 'v1-5',
      navigationType: 'navigate',
    });

    expect(() => window.dispatchEvent(new Event('pagehide'))).not.toThrow();
  });
});

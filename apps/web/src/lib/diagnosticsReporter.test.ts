import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildWebDiagnosticsBundle,
  displayMediaSupported,
  installGlobalCollectors,
  nodeDomain,
  recordRoute,
  recordWebBreadcrumb,
  resetWebReporterForTests,
  screenshotWithinGuard,
  webBreadcrumbs,
} from './diagnosticsReporter.js';

describe('web diagnostics reporter', () => {
  beforeEach(() => {
    resetWebReporterForTests();
  });

  it('keeps the newest breadcrumbs beyond the ring capacity', () => {
    for (let i = 0; i < 130; i += 1) recordRoute(`/route-${String(i)}`);
    const crumbs = webBreadcrumbs();
    expect(crumbs.length).toBeLessThanOrEqual(100);
    expect(crumbs.at(-1)?.detail).toContain('/route-129');
  });

  it('truncates breadcrumb detail to a safe length', () => {
    recordWebBreadcrumb('console-error', 'x'.repeat(500));
    expect(webBreadcrumbs()[0]?.detail.length).toBe(200);
  });

  it('installs global collectors once and records window errors', () => {
    installGlobalCollectors();
    installGlobalCollectors(); // second call is a no-op
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom: render died' }));
    const kinds = webBreadcrumbs().map((crumb) => crumb.kind);
    expect(kinds).toContain('window-error');
  });

  it('records unhandled rejections', async () => {
    installGlobalCollectors();
    const rejection = Promise.reject(new Error('async boom'));
    rejection.catch(() => undefined); // don't let vitest see it
    window.dispatchEvent(
      new PromiseRejectionEvent('unhandledrejection', {
        promise: rejection,
        reason: new Error('async boom'),
      }),
    );
    await Promise.resolve();
    expect(webBreadcrumbs().at(-1)?.detail).toContain('async boom');
  });

  it('wraps console.error, records the first string argument, still logs through', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      installGlobalCollectors();
      console.error('rpc failed', new Error('detail'));
      const crumb = webBreadcrumbs().at(-1);
      expect(crumb?.kind).toBe('console-error');
      expect(crumb?.detail).toBe('rpc failed');
      expect(spy).toHaveBeenCalledWith('rpc failed', expect.any(Error));
    } finally {
      spy.mockRestore();
    }
  });
});

describe('buildWebDiagnosticsBundle', () => {
  beforeEach(() => {
    resetWebReporterForTests();
  });

  it('builds a schema-valid web bundle with automatic context', () => {
    recordRoute('/');
    recordWebBreadcrumb('console-error', 'something odd');
    const bundle = buildWebDiagnosticsBundle({});
    expect(bundle.app).toBe('web');
    expect(bundle.schemaVersion).toBe(1);
    expect(bundle.sessionHandle).toBe('');
    expect(bundle.breadcrumbs.length).toBe(2);
    expect(bundle.capabilities['sessionPresent']).toBe(false);
    // The version globals are Vite-injected; in tests they read as 'dev'/''.
    expect(bundle.version.length).toBeGreaterThan(0);
  });

  it('attaches the handle only when opted in', () => {
    const bundle = buildWebDiagnosticsBundle({ sessionHandle: '@allie' });
    expect(bundle.sessionHandle).toBe('@allie');
  });

  it('passes a size-guarded screenshot through and drops anything else', () => {
    const good = `data:image/png;base64,${'A'.repeat(50)}`;
    expect(buildWebDiagnosticsBundle({ screenshotDataUrl: good }).screenshotDataUrl).toBe(good);
    expect(
      buildWebDiagnosticsBundle({
        screenshotDataUrl: `data:image/png;base64,${'A'.repeat(300_000)}`,
      }).screenshotDataUrl,
    ).toBeUndefined();
  });
});

describe('web reporter helpers', () => {
  it('nodeDomain reads location.host (empty outside a browser)', () => {
    expect(nodeDomain()).toBe(typeof location === 'undefined' ? '' : location.host);
  });

  it('displayMediaSupported is false under jsdom', () => {
    expect(displayMediaSupported()).toBe(false);
  });

  it('screenshotWithinGuard enforces PNG prefix and size', () => {
    expect(screenshotWithinGuard(`data:image/png;base64,${'A'.repeat(100)}`)).toBe(true);
    expect(screenshotWithinGuard('data:text/html;base64,AAAA')).toBe(false);
    expect(screenshotWithinGuard(`data:image/png;base64,${'A'.repeat(300_000)}`)).toBe(false);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

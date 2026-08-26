import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_REFRESHED_EVENT, type SessionRefreshedDetail } from '@patches/client';
import { MAX_DIAGNOSTICS_BREADCRUMBS } from '@patches/domain';

import {
  buildWebDiagnosticsBundle,
  DIAGNOSTICS_BREADCRUMB_STORAGE_KEY,
  displayMediaSupported,
  flushWebBreadcrumbsToSessionStorage,
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

  it('records a breadcrumb when the session is silently refreshed (B-169)', () => {
    installGlobalCollectors();
    window.dispatchEvent(
      new CustomEvent<SessionRefreshedDetail>(SESSION_REFRESHED_EVENT, {
        detail: { expiresAt: Date.UTC(2026, 0, 1) },
      }),
    );
    const last = webBreadcrumbs().at(-1);
    expect(last?.kind).toBe('session-refreshed');
    expect(last?.detail).toContain('2026-01-01');
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

describe('breadcrumb persistence across reloads (B-162)', () => {
  beforeEach(() => {
    resetWebReporterForTests();
  });

  it('restores the trail flushed on pagehide after a simulated reload', () => {
    installGlobalCollectors();
    recordRoute('/timeline');
    recordWebBreadcrumb('console-error', 'rpc status 14');
    window.dispatchEvent(new Event('pagehide'));

    resetWebReporterForTests(); // fresh page: empty ring, sessionStorage intact
    installGlobalCollectors();
    const details = webBreadcrumbs().map((crumb) => crumb.detail);
    expect(details).toContain('#1 /timeline');
    expect(details).toContain('rpc status 14');
    // Route numbering continues across the reload instead of restarting at #1.
    recordRoute('/settings');
    expect(webBreadcrumbs().at(-1)?.detail).toBe('#2 /settings');
  });

  it('feeds the restored trail into the report bundle', () => {
    installGlobalCollectors();
    recordWebBreadcrumb('window-error', 'TypeError: boom');
    window.dispatchEvent(new Event('pagehide'));

    resetWebReporterForTests();
    installGlobalCollectors();
    expect(buildWebDiagnosticsBundle({}).breadcrumbs.map((crumb) => crumb.detail)).toContain(
      'TypeError: boom',
    );
  });

  it('caps the persisted trail at the bundle breadcrumb limit, keeping the newest', () => {
    installGlobalCollectors();
    for (let i = 0; i < 130; i += 1) recordRoute(`/long-${String(i)}`);
    window.dispatchEvent(new Event('pagehide'));

    const stored = window.sessionStorage.getItem(DIAGNOSTICS_BREADCRUMB_STORAGE_KEY);
    expect(stored).not.toBeNull();
    const envelope = JSON.parse(stored ?? '') as { crumbs: { detail: string }[] };
    expect(envelope.crumbs).toHaveLength(MAX_DIAGNOSTICS_BREADCRUMBS);
    expect(envelope.crumbs.at(-1)?.detail).toContain('/long-129');

    resetWebReporterForTests();
    installGlobalCollectors();
    expect(webBreadcrumbs()).toHaveLength(MAX_DIAGNOSTICS_BREADCRUMBS);
    expect(webBreadcrumbs().at(-1)?.detail).toContain('/long-129');
  });

  it('discards a corrupt stored payload silently and starts empty', () => {
    window.sessionStorage.setItem(DIAGNOSTICS_BREADCRUMB_STORAGE_KEY, '{not json');
    installGlobalCollectors();
    expect(webBreadcrumbs()).toHaveLength(0);
  });

  it('discards an oversized stored value without parsing it', () => {
    window.sessionStorage.setItem(DIAGNOSTICS_BREADCRUMB_STORAGE_KEY, 'x'.repeat(300_000));
    installGlobalCollectors();
    expect(webBreadcrumbs()).toHaveLength(0);
  });

  it('discards a stored payload whose crumbs widen the captured kinds', () => {
    window.sessionStorage.setItem(
      DIAGNOSTICS_BREADCRUMB_STORAGE_KEY,
      JSON.stringify({
        v: 1,
        routeCounter: 4,
        crumbs: [{ at: '2026-08-25T00:00:00.000Z', kind: 'dm-body', detail: 'secret text' }],
      }),
    );
    installGlobalCollectors();
    expect(webBreadcrumbs()).toHaveLength(0);
  });

  it('never throws when the storage quota is exhausted (Safari private mode)', () => {
    installGlobalCollectors();
    recordRoute('/x');
    // jsdom Storage methods live on the prototype — an instance-level spyOn never intercepts.
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    });
    try {
      expect(() => flushWebBreadcrumbsToSessionStorage()).not.toThrow();
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('starts empty when storage reads are blocked', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    try {
      installGlobalCollectors();
      expect(webBreadcrumbs()).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  });
});

beforeEach(() => {
  // The persistence tests write the real (jsdom) sessionStorage; keep every test hermetic.
  window.sessionStorage.removeItem(DIAGNOSTICS_BREADCRUMB_STORAGE_KEY);
});

afterEach(() => {
  vi.restoreAllMocks();
});

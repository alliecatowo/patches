import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  diagnosticsBundleSchema,
  MAX_DIAGNOSTICS_BREADCRUMBS,
  MAX_DIAGNOSTICS_EVENTS,
} from '@patches/domain';

import {
  buildTuiDiagnosticsBundle,
  DiagnosticsReporter,
  getDiagnosticsReporter,
  resetDiagnosticsReporterForTests,
} from './reporter.js';

describe('DiagnosticsReporter', () => {
  let reporter: DiagnosticsReporter;

  beforeEach(() => {
    resetDiagnosticsReporterForTests();
    reporter = getDiagnosticsReporter();
  });

  afterEach(() => {
    resetDiagnosticsReporterForTests();
  });

  it('starts with a boot breadcrumb', () => {
    const breadcrumbs = reporter.snapshot().input.breadcrumbs ?? [];
    expect(breadcrumbs).toHaveLength(1);
    expect(breadcrumbs[0]?.kind).toBe('boot');
  });

  it('records rpc failures as status-code grade only — never a message body', () => {
    // The second argument is a *code*, the third the Connect enum name. There is no
    // parameter a DM body or server message could arrive through (§194 by construction).
    reporter.recordRpcFailure('sendMessage', 13, 'INTERNAL');
    const events = reporter.snapshot().input.events ?? [];
    expect(events.at(-1)?.message).toBe('rpc sendMessage failed: INTERNAL(13)');
  });

  it('keeps only the newest RING items for breadcrumbs and events', () => {
    for (let i = 0; i < MAX_DIAGNOSTICS_BREADCRUMBS + 10; i += 1) {
      reporter.recordBreadcrumb('nav', `screen ${String(i)}`);
    }
    for (let i = 0; i < MAX_DIAGNOSTICS_EVENTS + 5; i += 1) {
      reporter.recordEvent(`event ${String(i)}`);
    }
    const { input } = reporter.snapshot();
    const breadcrumbs = input.breadcrumbs ?? [];
    const events = input.events ?? [];
    expect(breadcrumbs).toHaveLength(MAX_DIAGNOSTICS_BREADCRUMBS);
    expect(breadcrumbs.at(-1)?.detail).toBe(`screen ${String(MAX_DIAGNOSTICS_BREADCRUMBS + 9)}`);
    expect(events).toHaveLength(MAX_DIAGNOSTICS_EVENTS);
    expect(events.at(-1)?.message).toBe(`event ${String(MAX_DIAGNOSTICS_EVENTS + 4)}`);
  });

  it('keeps only the frame tail across repeated setFrame calls', () => {
    reporter.setFrame('x'.repeat(30_000));
    reporter.setFrame('newer render');
    expect(reporter.snapshot().input.frame).toBe('newer render');
  });

  it('builds a schema-valid tui bundle through the shared domain path', () => {
    reporter.recordBreadcrumb('nav', 'thread');
    reporter.recordRpcFailure('listHomeFeed', 14, 'UNAVAILABLE');
    reporter.setCapabilities({ plainMode: true });
    const bundle = buildTuiDiagnosticsBundle({ nodeDomain: 'patches.example:7600' });
    expect(bundle.app).toBe('tui');
    expect(bundle.nodeDomain).toBe('patches.example:7600');
    expect(bundle.sessionHandle).toBe('');
    expect(bundle.capabilities).toEqual({ plainMode: true });
    expect(diagnosticsBundleSchema.safeParse(bundle).success).toBe(true);
  });
  it('attaches the handle only when the reporter opted in', () => {
    const bundle = buildTuiDiagnosticsBundle({
      nodeDomain: 'patches.example:7600',
      sessionHandle: '@allie',
      notes: 'crash on open',
    });
    expect(bundle.sessionHandle).toBe('@allie');
    expect(bundle.notes).toBe('crash on open');
  });

  it('redacts secrets that somehow reach breadcrumb detail before anything ships', () => {
    reporter.recordBreadcrumb('nav', 'opened settings api_key=supersecret');
    const bundle = buildTuiDiagnosticsBundle({ nodeDomain: 'patches.example:7600' });
    expect(JSON.stringify(bundle)).not.toContain('supersecret');
  });
});

describe('getDiagnosticsReporter singleton', () => {
  afterEach(() => {
    resetDiagnosticsReporterForTests();
  });

  it('returns the same instance process-wide', () => {
    expect(getDiagnosticsReporter()).toBe(getDiagnosticsReporter());
  });

  it('reset hands out a fresh instance (test isolation)', () => {
    const first = getDiagnosticsReporter();
    resetDiagnosticsReporterForTests();
    expect(getDiagnosticsReporter()).not.toBe(first);
  });

  it('a bare instance carries no capabilities until set', () => {
    const bare = new DiagnosticsReporter();
    expect(bare.snapshot().input.capabilities).toEqual({});
    bare.setCapabilities({ linearMode: false });
    expect(bare.snapshot().input.capabilities).toEqual({ linearMode: false });
  });
});

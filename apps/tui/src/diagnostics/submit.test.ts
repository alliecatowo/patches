import { describe, expect, it } from 'vitest';

import { buildDiagnosticsBundle } from '@patches/domain';

import { fallbackFileName, submitIssueReport } from './submit.js';

function testBundle() {
  return buildDiagnosticsBundle({
    app: 'tui',
    version: '0.1.0',
    nodeDomain: 'patches.example:7600',
  });
}

describe('submitIssueReport', () => {
  it('POSTs { description, bundle } and resolves the filed issue', async () => {
    const bodies: string[] = [];
    const fetchImpl = (_url: unknown, init?: RequestInit): Promise<Response> => {
      bodies.push(typeof init?.body === 'string' ? init.body : '');
      return Promise.resolve(
        new Response(JSON.stringify({ number: 42, url: 'https://github.com/x/issues/42' }), {
          status: 201,
        }),
      );
    };
    const outcome = await submitIssueReport({
      url: 'https://ingest.example/',
      description: 'crash on open',
      bundle: testBundle(),
      deps: { fetchImpl },
    });
    expect(outcome).toEqual({
      kind: 'filed',
      issueNumber: 42,
      issueUrl: 'https://github.com/x/issues/42',
    });
    const parsed = JSON.parse(bodies[0] ?? '{}') as { website?: string; description?: string };
    // The honeypot field is never sent by this client.
    expect(parsed['website']).toBeUndefined();
    expect(parsed['description']).toBe('crash on open');
  });

  it('falls back to a local file when the endpoint fails, printing the issues URL', async () => {
    const written = new Map<string, string>();
    const fetchImpl = (): Promise<Response> =>
      Promise.resolve(new Response('nope', { status: 502 }));
    const outcome = await submitIssueReport({
      url: 'https://ingest.example/',
      description: '',
      bundle: testBundle(),
      deps: {
        fetchImpl,
        writeFileImpl: (path, data) => {
          written.set(path, data);
          return Promise.resolve();
        },
        tmpDirImpl: async () => {
          await Promise.resolve();
          return '/tmp';
        },
        now: () => new Date('2026-08-23T01:02:03Z'),
      },
    });
    expect(outcome.kind).toBe('fallback');
    if (outcome.kind !== 'fallback') return;
    expect(outcome.bundlePath).toBe('/tmp/patches-report-2026-08-23T01-02-03.json');
    expect(outcome.issuesUrl).toContain('github.com/alliecatowo/patches/issues');
    expect(written.get(outcome.bundlePath)).toContain('"schemaVersion": 1');
  });

  it('still resolves a fallback outcome when even the local write fails', async () => {
    const fetchImpl = (): Promise<Response> => Promise.reject(new Error('dns failure'));
    const outcome = await submitIssueReport({
      url: 'https://ingest.example/',
      description: '',
      bundle: testBundle(),
      deps: {
        fetchImpl,
        writeFileImpl: () => Promise.reject(new Error('read-only fs')),
        tmpDirImpl: async () => {
          await Promise.resolve();
          return '/tmp';
        },
      },
    });
    expect(outcome.kind).toBe('fallback');
    if (outcome.kind === 'fallback') {
      expect(outcome.bundlePath).toBe('');
      expect(outcome.reason).toBe('dns failure');
    }
  });
});

describe('fallbackFileName', () => {
  it('is filesystem-safe and sortable', () => {
    expect(fallbackFileName(new Date('2026-08-23T09:08:07Z'))).toBe(
      'patches-report-2026-08-23T09-08-07.json',
    );
  });
});

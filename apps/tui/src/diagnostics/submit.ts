import { serializeDiagnosticsBundle, type DiagnosticsBundle } from '@patches/domain';

import { ISSUES_REPO_URL } from './report-endpoint.js';

/**
 * Submission path for the TUI issue reporter (B-112): POST the bundle to the
 * issues-ingest Worker, and on any failure fall back to writing the bundle JSON next
 * to nothing sensitive — a local file the reporter can attach by hand to a new issue
 * at {@link ISSUES_REPO_URL}.
 *
 * The Worker contract (`infra/issues-ingest/src/worker.js`): POST JSON
 * `{ description?, website?, bundle }` → `201 { number, url }`. The honeypot field is
 * deliberately left absent — bots fill it, this client never does.
 */

export interface SubmitResult {
  kind: 'filed';
  issueNumber: number;
  issueUrl: string;
}

export interface FallbackResult {
  kind: 'fallback';
  /** Where the bundle JSON was written for manual attach. */
  bundlePath: string;
  issuesUrl: string;
  reason: string;
}

export type SubmitOutcome = SubmitResult | FallbackResult;

export interface SubmitDeps {
  fetchImpl?: typeof fetch | undefined;
  writeFileImpl?: ((path: string, data: string) => Promise<void>) | undefined;
  tmpDirImpl?: (() => Promise<string>) | undefined;
  now?: (() => Date) | undefined;
}

interface ResolvedDeps {
  fetchImpl: typeof fetch;
  writeFileImpl: (path: string, data: string) => Promise<void>;
  tmpDirImpl: () => Promise<string>;
  now: () => Date;
}

function resolveDeps(deps: SubmitDeps | undefined): ResolvedDeps {
  return {
    fetchImpl: deps?.fetchImpl ?? fetch.bind(globalThis),
    writeFileImpl:
      deps?.writeFileImpl ??
      (async (path, data) => {
        const { writeFile } = await import('node:fs/promises');
        await writeFile(path, data, 'utf8');
      }),
    tmpDirImpl:
      deps?.tmpDirImpl ??
      (async () => {
        const { tmpdir } = await import('node:os');
        return tmpdir();
      }),
    now: deps?.now ?? (() => new Date()),
  };
}

/** File name for the manual-fallback dump. */
export function fallbackFileName(at: Date): string {
  const stamp = at.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `patches-report-${stamp}.json`;
}

/**
 * POSTs `{ description, bundle }` to the ingest worker. Resolves a {@link SubmitResult}
 * on success or a {@link FallbackResult} when the endpoint is unreachable/rejecting and
 * the bundle was written out locally instead. Never throws.
 */
export async function submitIssueReport(options: {
  url: string;
  description: string;
  bundle: DiagnosticsBundle;
  deps?: SubmitDeps;
}): Promise<SubmitOutcome> {
  const deps = resolveDeps(options.deps);
  try {
    const response = await deps.fetchImpl(options.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: options.description, bundle: options.bundle }),
    });
    if (response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        number?: unknown;
        url?: unknown;
      } | null;
      if (
        payload !== null &&
        typeof payload['number'] === 'number' &&
        typeof payload['url'] === 'string'
      ) {
        return {
          kind: 'filed',
          issueNumber: payload['number'],
          issueUrl: payload['url'],
        };
      }
    }
    throw new Error(`ingest worker answered ${String(response.status)}`);
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    try {
      const dir = await deps.tmpDirImpl();
      const bundlePath = `${dir}/${fallbackFileName(deps.now())}`;
      await deps.writeFileImpl(bundlePath, serializeDiagnosticsBundle(options.bundle));
      return {
        kind: 'fallback',
        bundlePath,
        issuesUrl: ISSUES_REPO_URL,
        reason,
      };
    } catch {
      // Even the local write failed (read-only tmpdir?) — surface the reason so the
      // reporter still knows what happened; there is nothing further to fall back to.
      return {
        kind: 'fallback',
        bundlePath: '',
        issuesUrl: ISSUES_REPO_URL,
        reason,
      };
    }
  }
}

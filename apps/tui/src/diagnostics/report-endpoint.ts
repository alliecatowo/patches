/**
 * Where issue reports go (B-112). The deployed issues-ingest Worker is the default;
 * `PATCHES_REPORT_URL` overrides it for local development against a wrangler dev
 * instance (`docs/operations/issue-reporter.md`).
 */
export const DEFAULT_REPORT_URL = 'https://patches-issues-ingest.alliecatowo.workers.dev/';

/** The repo the worker files issues on — printed by the manual fallback. */
export const ISSUES_REPO_URL = 'https://github.com/alliecatowo/patches/issues';

export function resolveReportUrl(env: NodeJS.ProcessEnv): string {
  const override = env.PATCHES_REPORT_URL?.trim();
  return override !== undefined && override !== '' ? override : DEFAULT_REPORT_URL;
}

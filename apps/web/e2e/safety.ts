export const MANAGED_WEB_ORIGIN = 'http://127.0.0.1:4173';
export const HARNESS_HTTP_ORIGIN = 'http://127.0.0.1:8088';

interface AttestedHarness {
  readonly httpOrigin: typeof HARNESS_HTTP_ORIGIN;
  readonly runId: string;
}

export function refuseExternalBaseURL(value: string | undefined): void {
  if (value !== undefined) {
    throw new Error(
      'PATCHES_E2E_BASE_URL is disabled until H-024 provides disposable-preview attestation.',
    );
  }
}

export function attestHarnessStatus(stdout: string): AttestedHarness {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    // A malformed ownership attestation is never trusted.
    throw new Error('patches-harness status did not return valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('patches-harness status did not return an object.');
  }

  const status = parsed as Record<string, unknown>;
  const processes = status['processes'];
  const ownedProcesses =
    typeof processes === 'object' &&
    processes !== null &&
    (processes as Record<string, unknown>)['server'] === 'owned-running' &&
    (processes as Record<string, unknown>)['worker'] === 'owned-running';
  const runId = status['runId'];
  if (
    status['status'] !== 'running' ||
    !ownedProcesses ||
    status['httpOrigin'] !== HARNESS_HTTP_ORIGIN ||
    typeof runId !== 'string' ||
    !/^[a-f0-9]{32}$/.test(runId)
  ) {
    throw new Error(
      'patches-harness is not an owned, running disposable lab at http://127.0.0.1:8088.',
    );
  }
  return { httpOrigin: HARNESS_HTTP_ORIGIN, runId };
}

export function assertManagedWebBase(baseURL: string | undefined): void {
  if (baseURL !== MANAGED_WEB_ORIGIN) {
    throw new Error('Local browser writes require the fresh Playwright-managed Vite origin.');
  }
}

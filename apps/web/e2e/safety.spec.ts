import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

import { attestHarnessStatus, HARNESS_HTTP_ORIGIN, refuseExternalBaseURL } from './safety.js';

const RUN_ID = '0123456789abcdef0123456789abcdef';

function status(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    status: 'running',
    processes: { server: 'owned-running', worker: 'owned-running' },
    httpOrigin: HARNESS_HTTP_ORIGIN,
    runId: RUN_ID,
    ...overrides,
  });
}

test.describe('browser E2E write-target safety', () => {
  test('refuses every externally supplied browser base URL', () => {
    expect(() => refuseExternalBaseURL(undefined)).not.toThrow();
    expect(() => refuseExternalBaseURL('http://127.0.0.1:5173')).toThrow(/H-024/);
    expect(() => refuseExternalBaseURL('https://pr-76.patches-web.pages.dev')).toThrow(/H-024/);
  });

  test('accepts exact structured ownership attestation from the harness CLI', () => {
    expect(attestHarnessStatus(status())).toEqual({
      httpOrigin: HARNESS_HTTP_ORIGIN,
      runId: RUN_ID,
    });
  });

  test('rejects missing ownership, the wrong origin, or a missing run ID', () => {
    expect(() => attestHarnessStatus(status({ status: 'degraded' }))).toThrow(/not an owned/);
    expect(() =>
      attestHarnessStatus(status({ processes: { server: 'owned-running', worker: 'stopped' } })),
    ).toThrow(/not an owned/);
    expect(() => attestHarnessStatus(status({ httpOrigin: 'http://127.0.0.1:8080' }))).toThrow(
      /not an owned/,
    );
    expect(() => attestHarnessStatus(status({ runId: undefined }))).toThrow(/not an owned/);
  });

  test('managed Vite child receives no database or cloud credentials', () => {
    const wrapper = fileURLToPath(new URL('./start-managed-vite.mjs', import.meta.url));
    const stdout = execFileSync(process.execPath, [wrapper, '--print-child-env'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATCHES_DEV_UPSTREAM: HARNESS_HTTP_ORIGIN,
        DATABASE_URL: 'postgres://production',
        AWS_SECRET_ACCESS_KEY: 'aws-production-secret',
        R2_SECRET_ACCESS_KEY: 'r2-production-secret',
        FLY_API_TOKEN: 'fly-production-token',
        VITE_PATCHES_API_BASE: 'https://patches-social.fly.dev:8443',
      },
    });
    const childEnvironment = JSON.parse(stdout) as Record<string, unknown>;

    expect(childEnvironment['PATCHES_DEV_UPSTREAM']).toBe(HARNESS_HTTP_ORIGIN);
    expect(childEnvironment['VITE_PATCHES_DISABLE_SERVICE_WORKER']).toBe('1');
    for (const forbidden of [
      'DATABASE_URL',
      'AWS_SECRET_ACCESS_KEY',
      'R2_SECRET_ACCESS_KEY',
      'FLY_API_TOKEN',
      'VITE_PATCHES_API_BASE',
    ]) {
      expect(childEnvironment).not.toHaveProperty(forbidden);
    }
  });
});

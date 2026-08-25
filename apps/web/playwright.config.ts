import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

import { attestHarnessStatus, MANAGED_WEB_ORIGIN, refuseExternalBaseURL } from './e2e/safety.js';

refuseExternalBaseURL(process.env['PATCHES_E2E_BASE_URL']);

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const harnessCli = fileURLToPath(new URL('../../packages/harness/dist/cli.js', import.meta.url));
const statusOutput = execFileSync(process.execPath, [harnessCli, 'status'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
  env: {
    HOME: process.env['HOME'],
    LANG: process.env['LANG'],
    LC_ALL: process.env['LC_ALL'],
    PATH: process.env['PATH'],
    TZ: process.env['TZ'],
    PATCHES_HARNESS_ROOT: repositoryRoot,
  },
});
const harness = attestHarnessStatus(statusOutput.trim());

/**
 * Browser smoke configuration. The suite itself validates that its UI target is a lab-safe
 * origin before any write action. Vite's proxy is pinned to loopback by default so merely
 * running this command cannot write to the normal development proxy's production upstream.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  outputDir: '../../.codex/playwright-output',
  preserveOutput: 'always',
  fullyParallel: false,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  timeout: 45_000,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: MANAGED_WEB_ORIGIN,
    ...devices['Desktop Chrome'],
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    // Playwright always overlays this on its own environment. The wrapper is therefore the
    // security boundary: it spawns Vite with a closed allowlist rather than forwarding its env.
    command: `${JSON.stringify(process.execPath)} e2e/start-managed-vite.mjs`,
    url: MANAGED_WEB_ORIGIN,
    reuseExistingServer: false,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    timeout: 120_000,
    env: {
      PATCHES_DEV_UPSTREAM: harness.httpOrigin,
    },
  },
});

import { join } from 'node:path';

/**
 * Browser smoke-test planning for the harness (H-018#189).
 *
 * This module computes, in pure form, the steps and artifact paths a Playwright-driven web test
 * would run against a live lab: it decides which origin to drive, what the register -> compose ->
 * assert -> screenshot flow looks like, and where screenshots are allowed to land. Keeping this
 * logic free of Playwright/network lets it be unit-tested offline (the `mise run check harness`
 * gate forbids launching a browser or a real web server).
 *
 * `cli.ts` owns actually driving the browser (gated on a locally-available lab + Playwright) and
 * turns this plan into a run; this module only reasons about the plan.
 */

export interface BrowserSmokePlanInput {
  /** The lab's HTTP origin (e.g. `http://127.0.0.1:8088`) that serves the web app. */
  readonly webOrigin: string;
  /** Repo-local artifact directory that already exists and is 0o700-owned by the harness. */
  readonly runDirectory: string;
}

export interface BrowserSmokePlan {
  /** A display handle, unique per plan, used as the seeded account handle. */
  readonly handle: string;
  /** The seeded disposable email that never collides with a real mailbox. */
  readonly email: string;
  /** Marker text asserted to appear after composing a post — unique to the settled state. */
  readonly composedPostMarker: string;
  /** The post body used for the smoke compose action. */
  readonly postBody: string;
  /** Absolute path where the final screenshot is written. */
  readonly screenshotPath: string;
  /** The steps this plan represents, in order, for human-facing narration. */
  readonly steps: readonly string[];
}

function deterministicToken(): string {
  return 'wkb0' + Math.random().toString(36).slice(2, 10);
}

/**
 * Computes a browser smoke plan against a discovered lab origin. The handle is prefixed with a
 * fixed marker so the smoke account is recognisable in admin/logs and never collides with the
 * stable-key world accounts (`wk-*`).
 */
export function browserSmokePlan(input: BrowserSmokePlanInput): BrowserSmokePlan {
  if (!/^https?:\/\/127\.0\.0\.1:\d{1,5}$/u.test(input.webOrigin))
    throw new Error('browser smoke web origin must be a loopback http(s) origin');
  const token = deterministicToken();
  const handle = `wk-smoke-${token}`;
  const email = `${handle}@example.invalid`;
  return {
    handle,
    email,
    composedPostMarker: 'Smoke marker',
    postBody: `smoke ${handle}`,
    screenshotPath: join(input.runDirectory, 'smoke.png'),
    steps: [
      'launch headless chromium',
      `register ${handle}`,
      'compose a post',
      `assert "${'Smoke marker'}" rendered`,
      `screenshot ${join(input.runDirectory, 'smoke.png')}`,
    ],
  };
}

/** True when this origin serves the Patches lab (checked against its `/healthz`). */
export function isLabOrigin(origin: string): boolean {
  return /^https?:\/\/127\.0\.0\.1:\d{1,5}$/u.test(origin);
}

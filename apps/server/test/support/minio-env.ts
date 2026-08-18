/**
 * Local MinIO defaults for the media integration suite (ADR 0015, `infra/compose/docker-compose.yml`).
 * Additive support module — doesn't touch `env.ts`'s `prepareServerEnv`, which every other
 * integration suite already depends on and must stay unaffected by media-specific setup.
 */
export const TEST_MINIO_DEFAULTS = {
  R2_ENDPOINT: 'http://127.0.0.1:9000',
  R2_ACCESS_KEY_ID: 'patches',
  R2_SECRET_ACCESS_KEY: 'patchespatches',
  R2_BUCKET: 'patches-media',
  R2_FORCE_PATH_STYLE: 'true',
  R2_REGION: 'auto',
} as const;

/** Fills in `R2_*` env vars with the compose defaults, but never overwrites a value the
 * environment (or a developer's `.env`) already set — same "don't clobber" stance
 * `prepareServerEnv` takes for most of its variables. Must run before `startTestServer()`
 * (which imports `config.module.js`, and `ConfigModule.forRoot()` validates `process.env`
 * at call time — see `env.ts`'s own note on this). */
export function prepareMediaTestEnv(): void {
  for (const [key, value] of Object.entries(TEST_MINIO_DEFAULTS)) {
    const current = process.env[key];
    if (current === undefined || current.length === 0) {
      process.env[key] = value;
    }
  }
}

/** Best-effort reachability probe — any HTTP response (even an auth error) means something
 * is listening and speaking HTTP, which is all `describe.skipIf` needs to decide whether to
 * run the suite. Never throws. */
export async function isMinioReachable(
  url: string = TEST_MINIO_DEFAULTS.R2_ENDPOINT,
): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response.status >= 100;
  } catch {
    return false;
  }
}

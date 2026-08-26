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

/** Forces `R2_*` env vars to the compose MinIO defaults — **overwritten, never defaulted**,
 * same stance `env.ts` documents for `DATABASE_URL` and for the identical reason: this suite's
 * own `S3StorageClient` (in `beforeAll`, below) and `isMinioReachable()` both hardcode
 * `TEST_MINIO_DEFAULTS` and talk to local MinIO only, so the server-under-test's storage client
 * must point at the exact same instance or the two halves of the suite silently diverge. A
 * "don't clobber" `??=` here previously let a developer's shell or `.env` — commonly holding
 * real Cloudflare R2 production credentials for `mise run server` — leak into the test process,
 * producing a MinIO `403 InvalidAccessKeyId`/`SignatureDoesNotMatch` against a presigned URL
 * that was actually signed for R2, not local MinIO (B-092). Must run before `startTestServer()`
 * (which imports `config.module.js`, and `ConfigModule.forRoot()` validates `process.env`
 * at call time — see `env.ts`'s own note on this). */
export function prepareMediaTestEnv(): void {
  for (const [key, value] of Object.entries(TEST_MINIO_DEFAULTS)) {
    process.env[key] = value;
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

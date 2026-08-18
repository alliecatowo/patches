/** Local MinIO defaults for the worker's media-processing integration suite (ADR 0015,
 * `infra/compose/docker-compose.yml`) — mirrors `apps/server/test/support/minio-env.ts`
 * (kept as a small parallel copy rather than a shared package: it's test-only glue, and each
 * app's integration suite is meant to stand alone). */
export const TEST_MINIO_DEFAULTS = {
  endpoint: 'http://127.0.0.1:9000',
  region: 'auto',
  bucket: 'patches-media',
  accessKeyId: 'patches',
  secretAccessKey: 'patchespatches',
  forcePathStyle: true,
} as const;

/** Best-effort reachability probe — any HTTP response means something is listening. Never
 * throws. */
export async function isMinioReachable(
  url: string = TEST_MINIO_DEFAULTS.endpoint,
): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response.status >= 100;
  } catch {
    return false;
  }
}

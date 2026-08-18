import { z } from 'zod';

/**
 * Cloudflare R2 (or local MinIO standing in for it) object storage configuration.
 * Optional in development — a local server can boot without media configured yet; when
 * media features are wired up, `apps/server`/`apps/worker` should compose this with a
 * production-only `superRefine` (mirroring `serverEnvSchema`'s JWT check) once those
 * fields are actually load-bearing.
 */
export const storageEnvSchema = z.object({
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_ENDPOINT: z.url().optional(),
});

export type StorageEnv = z.infer<typeof storageEnvSchema>;

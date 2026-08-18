import { z } from 'zod';
import { booleanish } from '../boolean.js';

/**
 * S3-compatible object storage configuration (ADR 0005, ADR 0015): Cloudflare R2 in
 * production, MinIO standing in for it in local dev — one code path (`@patches/media`'s
 * `S3StorageClient`) serves both, since both speak the S3 API.
 *
 * Optional in development — a plain server/worker boot doesn't need media configured; the
 * media module surfaces a clear error at call time (not boot time) if it's asked to do
 * something storage-shaped without these set. Production readiness for storage is each
 * app's own concern (mirroring `serverEnvSchema`'s JWT `superRefine` pattern) since not
 * every process (e.g. a server instance with media disabled) needs it.
 */
export const storageEnvSchema = z.object({
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_ENDPOINT: z.url().optional(),
  /** `auto` is Cloudflare R2's own convention; MinIO/S3 ignore it beyond needing *a* value. */
  R2_REGION: z.string().min(1).default('auto'),
  /**
   * Path-style addressing (`https://endpoint/bucket/key`) instead of virtual-hosted-style
   * (`https://bucket.endpoint/key`). MinIO needs this; R2 also accepts it, so one flag can
   * default true and just work for both rather than branching on which backend it is.
   */
  R2_FORCE_PATH_STYLE: booleanish().default(true),

  /** 10 MB per §28's default — overridable for real performance testing, but always set. */
  MEDIA_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024),
  /** 20 megapixels per §28 — decompression-bomb guard for the worker's `sharp` calls. */
  MEDIA_MAX_PIXELS: z.coerce.number().int().positive().default(20_000_000),
  /** Presigned PUT TTL — short-lived per §30. */
  MEDIA_PRESIGN_PUT_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  /** Presigned GET TTL — short-lived per §32. */
  MEDIA_PRESIGN_GET_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  /** How long a `PENDING_UPLOAD` row may sit with no `FinalizeMediaUpload` before
   * `CLEAN_EXPIRED_UPLOADS` reclaims it and its (possibly-never-uploaded) object. */
  MEDIA_PENDING_UPLOAD_EXPIRY_MINUTES: z.coerce.number().int().positive().default(60),
});

export type StorageEnv = z.infer<typeof storageEnvSchema>;

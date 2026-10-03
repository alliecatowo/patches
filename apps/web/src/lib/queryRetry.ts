import { isTransientError } from '@patches/client';

/**
 * Retry policy for react-query reads (`QueryClient` default).
 *
 * The API runs on a scale-to-zero Fly machine: the first request after idle can take
 * ~15-20s, during which the proxy answers 502/503 (Connect `Unavailable`) or our per-call
 * deadline fires (`DeadlineExceeded`). A single retry one second later (the old default)
 * gave up long before the machine was ready, so transient failures now retry with
 * exponential backoff (1s, 2s, 4s, 8s, 8s, ...) for roughly a minute of wall time. Any
 * other failure (NotFound, PermissionDenied, ...) is deterministic, so it keeps the
 * previous single retry.
 */
export const MAX_TRANSIENT_RETRIES = 6;

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (isTransientError(error)) return failureCount < MAX_TRANSIENT_RETRIES;
  return failureCount < 1;
}

export function queryRetryDelay(failureCount: number): number {
  return Math.min(1000 * 2 ** failureCount, 8000);
}

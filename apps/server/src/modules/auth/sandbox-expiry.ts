import { AppError } from '../../common/errors/app-error.js';

/**
 * ADR 0044: a demo-sandbox account stops working at `users.sandbox_expires_at`, whether or not
 * the purge sweep has gotten to its rows yet. The sweep can only run while the (scale-to-zero)
 * node is awake, so token validity must never depend on it: every place that turns a token
 * into a live session calls this. Real accounts have a NULL expiry and pass straight through.
 */
export function assertSandboxNotExpired(
  user: { sandboxExpiresAt?: Date | null },
  now: Date = new Date(),
): void {
  const expiresAt = user.sandboxExpiresAt;
  if (expiresAt === null || expiresAt === undefined) return;
  if (expiresAt.getTime() <= now.getTime()) {
    throw new AppError('AUTH_SESSION_EXPIRED', 'This demo has ended. Start a new one to continue.');
  }
}

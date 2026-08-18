import { createHash, randomBytes } from 'node:crypto';

/**
 * SHA-256 hex — deliberately the exact same construction as `apps/server/src/modules/auth/
 * token.service.ts`'s `hashRefreshToken` (reused there for invite codes too, as `hashCode`).
 * `apps/admin` cannot import server application code (spec §128–129 — `apps/admin` talks to
 * Postgres directly, never through `apps/server`), so this is a second, tiny copy rather than
 * a shared dependency; the two must keep agreeing on the algorithm or every invite this CLI
 * mints would fail to redeem.
 */
export function hashInviteCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}

/** 32 random bytes, base64url — the same entropy budget `AuthService`'s verification/reset
 * codes use (`AUTH_CODE_BYTES`), reasonable for an invite code too. */
export function generateInviteCode(): string {
  return randomBytes(32).toString('base64url');
}

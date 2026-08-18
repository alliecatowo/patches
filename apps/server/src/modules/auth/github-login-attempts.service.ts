import { Injectable } from '@nestjs/common';

/**
 * Process-local state for in-flight GitHub device-flow logins (P6-005, spec §167) —
 * `BeginGitHubLogin`'s `device_code` and `interval` round-trip through the client, but
 * *which* Patches session (if any) called `BeginGitHubLogin` does not: `PollGitHubLoginRequest`
 * carries only `device_code`. This store is what lets `PollGitHubLogin` recover that later.
 *
 * Same v0 stopgap as `RateLimitService` (spec §102 allows coarse process-local state; no Redis
 * in v0, §153): with more than one server process a poll can land on a process that never saw
 * the matching `Begin` call. Acceptable for a flow the user is actively driving with a device
 * code displayed on screen — the client's own retry loop will eventually hit a process that
 * has it, or GitHub's own `device_code` will simply expire and the user starts over. A
 * DB-backed table would remove this limitation; tracked as a follow-up (see this task's report)
 * rather than added speculatively to a migration this task did not otherwise need.
 */

export interface GitHubLoginAttempt {
  deviceCode: string;
  expiresAt: Date;
  intervalMs: number;
  lastPolledAt: number | null;
  /** Set only when `BeginGitHubLogin` was called on an authenticated session — the account a
   * successful poll should *link* GitHub to (§167's "linking ... MUST require an
   * authenticated Patches session"). `null` means an anonymous login attempt: success only
   * signs in an *already-linked* GitHub credential, never creates one. */
  callerUserId: string | null;
}

@Injectable()
export class GitHubLoginAttemptsService {
  private readonly attempts = new Map<string, GitHubLoginAttempt>();

  /** Above this many live attempts, a brand-new one is refused — same reasoning as
   * `RateLimitService.MAX_BUCKETS`: bounds unbounded memory growth from a flood of
   * `BeginGitHubLogin` calls that are never polled to completion. */
  private static readonly MAX_ATTEMPTS = 5_000;

  begin(input: {
    deviceCode: string;
    expiresAt: Date;
    intervalMs: number;
    callerUserId: string | null;
  }): void {
    this.pruneExpired();
    if (this.attempts.size >= GitHubLoginAttemptsService.MAX_ATTEMPTS) {
      // Silently drop rather than throw: `AuthService.beginGitHubLogin` has already told the
      // caller a device code exists by this point (GitHub issued it before this call), so
      // refusing outright would strand a real GitHub-side device code. The poll simply won't
      // resolve — indistinguishable from "GitHub's own expiry", which the client already
      // handles.
      return;
    }
    this.attempts.set(input.deviceCode, {
      deviceCode: input.deviceCode,
      expiresAt: input.expiresAt,
      intervalMs: input.intervalMs,
      lastPolledAt: null,
      callerUserId: input.callerUserId,
    });
  }

  get(deviceCode: string, now: Date = new Date()): GitHubLoginAttempt | undefined {
    const attempt = this.attempts.get(deviceCode);
    if (attempt === undefined) return undefined;
    if (attempt.expiresAt.getTime() <= now.getTime()) {
      this.attempts.delete(deviceCode);
      return undefined;
    }
    return attempt;
  }

  /** True if this poll is allowed to reach GitHub (at least `intervalMs` since the last one);
   * always records `now` as the new "last polled" time regardless of the answer, so a client
   * that ignores `SLOW_DOWN` and hammers anyway never gets a shorter effective interval. */
  tryConsumePoll(deviceCode: string, now: Date = new Date()): boolean {
    const attempt = this.attempts.get(deviceCode);
    if (attempt === undefined) return false;
    const allowed =
      attempt.lastPolledAt === null || now.getTime() - attempt.lastPolledAt >= attempt.intervalMs;
    attempt.lastPolledAt = now.getTime();
    return allowed;
  }

  /** GitHub's own `slow_down` response asks for a longer interval going forward. */
  extendInterval(deviceCode: string, extraMs: number): void {
    const attempt = this.attempts.get(deviceCode);
    if (attempt !== undefined) attempt.intervalMs += extraMs;
  }

  /** Called once a poll reaches a terminal state (success, denied, or expired) — a
   * `device_code` is single-use by construction on GitHub's side too. */
  consume(deviceCode: string): void {
    this.attempts.delete(deviceCode);
  }

  private pruneExpired(now: Date = new Date()): void {
    for (const [key, attempt] of this.attempts) {
      if (attempt.expiresAt.getTime() <= now.getTime()) this.attempts.delete(key);
    }
  }
}

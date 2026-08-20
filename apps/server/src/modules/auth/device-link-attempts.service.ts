import { Injectable } from '@nestjs/common';

/**
 * Process-local state for in-flight web↔terminal device links (P15-005) — mirrors
 * `GitHubLoginAttemptsService`/`OidcLoginAttemptsService` exactly (see either's doc comment for
 * the full §102/§153 "coarse process-local state, no Redis in v0" reasoning).
 *
 * Two lookup keys exist on purpose: `device_code` (long, secret, held by the browser and used
 * only to poll) and `user_code` (short, human-typeable, read off the browser and typed into an
 * already-signed-in terminal). `AuthService.approveDeviceLink` only ever has the latter —
 * `PollDeviceLinkRequest` only ever has the former — so both directions need their own map.
 */

export interface DeviceLinkAttempt {
  deviceCode: string;
  userCode: string;
  expiresAt: Date;
  intervalMs: number;
  lastPolledAt: number | null;
  /** Set once `ApproveDeviceLink` binds this link to an authenticated account; `null` while
   * still pending. Never overwritten once set — {@link DeviceLinkAttemptsService.approve} only
   * succeeds the first time a given `user_code` is approved, so a link can never be silently
   * re-bound to a second, different account. */
  approvedUserId: string | null;
}

@Injectable()
export class DeviceLinkAttemptsService {
  private readonly byDeviceCode = new Map<string, DeviceLinkAttempt>();
  private readonly deviceCodeByUserCode = new Map<string, string>();

  /** Same bound as `GitHubLoginAttemptsService.MAX_ATTEMPTS`, shared reasoning: bounds
   * unbounded memory growth from a flood of `BeginDeviceLink` calls never approved/polled to
   * completion. */
  private static readonly MAX_ATTEMPTS = 5_000;

  begin(input: {
    deviceCode: string;
    userCode: string;
    expiresAt: Date;
    intervalMs: number;
  }): void {
    this.pruneExpired();
    if (this.byDeviceCode.size >= DeviceLinkAttemptsService.MAX_ATTEMPTS) {
      // Silently drop rather than throw — same reasoning as `GitHubLoginAttemptsService.begin`:
      // the caller has already been told a device/user code pair exists by this point, so
      // refusing outright would strand it. The poll simply won't resolve and the approve
      // attempt will report the code invalid, both indistinguishable from ordinary expiry.
      return;
    }
    this.byDeviceCode.set(input.deviceCode, {
      deviceCode: input.deviceCode,
      userCode: input.userCode,
      expiresAt: input.expiresAt,
      intervalMs: input.intervalMs,
      lastPolledAt: null,
      approvedUserId: null,
    });
    this.deviceCodeByUserCode.set(input.userCode, input.deviceCode);
  }

  get(deviceCode: string, now: Date = new Date()): DeviceLinkAttempt | undefined {
    const attempt = this.byDeviceCode.get(deviceCode);
    if (attempt === undefined) return undefined;
    if (attempt.expiresAt.getTime() <= now.getTime()) {
      this.delete(attempt);
      return undefined;
    }
    return attempt;
  }

  /** True if this poll is allowed to be answered (at least `intervalMs` since the last one);
   * always records `now` as the new "last polled" time regardless of the answer, so a client
   * that ignores `SLOW_DOWN` and hammers anyway never gets a shorter effective interval. */
  tryConsumePoll(deviceCode: string, now: Date = new Date()): boolean {
    const attempt = this.byDeviceCode.get(deviceCode);
    if (attempt === undefined) return false;
    const allowed =
      attempt.lastPolledAt === null || now.getTime() - attempt.lastPolledAt >= attempt.intervalMs;
    attempt.lastPolledAt = now.getTime();
    return allowed;
  }

  /**
   * Binds the pending link identified by `userCode` to `approvingUserId`. Returns `false` — the
   * caller must treat this as the single uniform "invalid code" failure — for an unknown,
   * expired, or *already-approved* code; the last case is what stops a second approval (by the
   * same or a different account) from ever re-binding an already-claimed link.
   */
  approve(userCode: string, approvingUserId: string, now: Date = new Date()): boolean {
    const deviceCode = this.deviceCodeByUserCode.get(userCode);
    if (deviceCode === undefined) return false;
    const attempt = this.byDeviceCode.get(deviceCode);
    if (attempt === undefined) return false;
    if (attempt.expiresAt.getTime() <= now.getTime()) {
      this.delete(attempt);
      return false;
    }
    if (attempt.approvedUserId !== null) return false;

    attempt.approvedUserId = approvingUserId;
    return true;
  }

  /** Called once a poll reaches a terminal state (success or expired) — a `device_code`/
   * `user_code` pair is single-use by construction. */
  consume(deviceCode: string): void {
    const attempt = this.byDeviceCode.get(deviceCode);
    if (attempt !== undefined) this.delete(attempt);
  }

  private delete(attempt: DeviceLinkAttempt): void {
    this.byDeviceCode.delete(attempt.deviceCode);
    this.deviceCodeByUserCode.delete(attempt.userCode);
  }

  private pruneExpired(now: Date = new Date()): void {
    for (const attempt of this.byDeviceCode.values()) {
      if (attempt.expiresAt.getTime() <= now.getTime()) this.delete(attempt);
    }
  }
}

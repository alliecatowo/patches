/**
 * S-002 (abuse/spike protection, `docs/operations/abuse-protection.md`): per-job-type circuit
 * breaker over `JobRunner`'s claim loop.
 *
 * A job type that keeps failing (a downstream outage — an unreachable federation peer, a dead
 * email provider) would otherwise get reclaimed and re-attempted every pass, consuming this
 * worker's whole `WORKER_CONCURRENCY` claim budget on rows that are about to fail again, while
 * a healthy type's backlog piles up unclaimed behind it (`claimOutboxJobs`'s `ORDER BY id ASC`).
 * Opening the circuit for that one type — excluding it from `claimOutboxJobs` for a cooldown —
 * lets its own backlog grow (bounded backoff/dead-lettering still applies to any row already
 * claimed) while every other type keeps draining normally. This is process-local, in-memory
 * state (no Redis in v0, spec §153): a second worker process makes its own independent
 * decision, which is fine — a circuit here is a courtesy to that one process's own capacity,
 * not a cluster-wide breaker.
 *
 * States, per job type: **closed** (default — claimable), **open** (excluded until
 * `openUntil`), **half-open** (past `openUntil` — exactly one trial claim is allowed through;
 * `JobRunner` reports its outcome via {@link recordSuccess}/{@link recordFailure}). A trial
 * success closes the circuit outright; a trial failure reopens it for another full cooldown.
 */
export class OutboxCircuitBreaker {
  private readonly state = new Map<string, { consecutiveFailures: number; openUntil: number }>();

  constructor(
    private readonly failureThreshold: number,
    private readonly cooldownMs: number,
  ) {}

  /**
   * Job types `claimOutboxJobs` should exclude this pass: open, and not yet past `openUntil`.
   * A type past `openUntil` is deliberately **not** excluded here — that is the half-open
   * trial claim, indistinguishable from a normal claim until its outcome is recorded.
   */
  excludedTypes(now = Date.now()): string[] {
    const excluded: string[] = [];
    for (const [type, entry] of this.state) {
      if (entry.openUntil > now) excluded.push(type);
    }
    return excluded;
  }

  /** A claimed job of `type` succeeded — closes the circuit outright (resets the failure
   * count and any cooldown), whether this was a trial claim or an ordinary one. */
  recordSuccess(type: string): void {
    this.state.delete(type);
  }

  /**
   * A claimed job of `type` failed. Opens (or re-opens) the circuit once `failureThreshold`
   * *consecutive* failures have been recorded for this type — a single flaky job must not trip
   * the breaker for every other job of the same type.
   */
  recordFailure(type: string, now = Date.now()): void {
    const entry = this.state.get(type) ?? { consecutiveFailures: 0, openUntil: 0 };
    entry.consecutiveFailures += 1;
    if (entry.consecutiveFailures >= this.failureThreshold) {
      entry.openUntil = now + this.cooldownMs;
    }
    this.state.set(type, entry);
  }

  /** Test/observability hook: whether `type`'s circuit is currently open. */
  isOpen(type: string, now = Date.now()): boolean {
    return (this.state.get(type)?.openUntil ?? 0) > now;
  }
}

/**
 * Polls `predicate` until it returns `true` or `timeoutMs` elapses. For observing an async
 * DB-visible state change (a worker's job claim landing, a projection catching up) instead of
 * sleeping a fixed — and either flaky-short or wastefully-long — duration.
 *
 * Deliberately has no knowledge of jobs, workers, or the outbox: it is a generic condition
 * poll, not an outbox claimer. A test still has to observe state through its own DB query or
 * RPC call, never by reaching into `OutboxJob` and claiming/leasing a row itself — that could
 * steal work from a real worker process sharing the same database.
 */
export async function waitFor(
  predicate: () => Promise<boolean>,
  { timeoutMs = 5000, intervalMs = 20 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() >= deadline) {
      throw new Error(`waitFor: condition not met within ${String(timeoutMs)}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

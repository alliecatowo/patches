/**
 * Polls `predicate` until it returns `true` or `timeoutMs` elapses. Used by the integration
 * tests to observe `JobRunner`'s async claim loop reaching a DB state, instead of sleeping a
 * fixed (and either flaky-short or wastefully-long) duration.
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

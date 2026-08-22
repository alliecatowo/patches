/**
 * Pure, framework-free logic behind `RpcBudgetInterceptor` (S-001/S-002,
 * `docs/operations/capacity.md`): classifying an RPC into a cost class, and the fixed-window
 * bucket limiter that class's budget is spent against. Kept separate from the interceptor
 * itself so it is unit-testable without mocking a Nest `ExecutionContext`/`Observable`.
 */

export type RpcClass = 'read' | 'write' | 'search';

/** RPCs whose name alone doesn't fit the `Get*`/`List*`/`Stream*` = read convention below —
 * currently just the one `ILIKE`-scan search RPC, which gets its own tighter budget. */
const SEARCH_METHODS: ReadonlySet<string> = new Set(['SearchPosts']);

/**
 * Classifies `patches.v1.<Service>/<Method>` (or the `Controller/handler` fallback shape
 * `RequestContextInterceptor`'s own `rpcPath` produces) into a cost class: `search` for the
 * one expensive full-text scan, `read` for every `Get*`/`List*`/`Stream*` method, `write` for
 * everything else (every mutating RPC by construction, since this repo's naming convention has
 * no third verb family — verified against every `*.controller.ts` in `apps/server/src/modules`).
 */
export function classifyRpc(rpc: string): RpcClass {
  const method = rpc.split('/')[1] ?? rpc;
  if (SEARCH_METHODS.has(method)) return 'search';
  if (/^(Get|List|Stream)/.test(method)) return 'read';
  return 'write';
}

export interface BudgetWindow {
  limit: number;
  windowMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/** Above this many live buckets for one limiter, a brand-new key is refused admission rather
 * than evicting a live one — same anti-eviction-flood reasoning as `RateLimitService`'s own
 * `MAX_BUCKETS` (`modules/auth/rate-limit.service.ts`). */
const MAX_BUCKETS = 20_000;

/**
 * Fixed-window, process-local (no Redis in v0, spec §153) limiter over an arbitrary string key.
 * `RpcBudgetInterceptor` runs one instance per (class × key-type) pair — e.g. one for
 * `read`+peer, a separate one for `read`+actor — so a caller's read budget is never confused
 * with their write budget.
 */
export class RpcBudgetLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly window: BudgetWindow) {}

  /** Clear all buckets. Intended for resetting in-process test state between examples. */
  clear(): void {
    this.buckets.clear();
  }

  /** Returns `true` if `key` is under budget for this window (and records the attempt),
   * `false` once the window's limit is spent. Never throws — the caller decides what a
   * rejection means (an `AppError`, a metric, both). */
  tryConsume(key: string, now = Date.now()): boolean {
    const existing = this.buckets.get(key);

    if (existing === undefined || existing.resetAt <= now) {
      if (existing === undefined) {
        this.pruneExpired(now);
        if (this.buckets.size >= MAX_BUCKETS) return false;
      }
      this.buckets.set(key, { count: 1, resetAt: now + this.window.windowMs });
      return true;
    }

    existing.count += 1;
    return existing.count <= this.window.limit;
  }

  private pruneExpired(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

/**
 * The S-002 load-shedding gate: an in-process admission counter, not a rate limiter — it has no
 * window, just a ceiling on concurrently in-flight calls. `tryAcquire`/`release` must always be
 * paired (the interceptor pairs them via RxJS `finalize`), or the counter leaks upward forever.
 */
export class ConcurrencyGate {
  private inFlight = 0;

  constructor(private readonly limit: number) {}

  tryAcquire(): boolean {
    if (this.inFlight >= this.limit) return false;
    this.inFlight += 1;
    return true;
  }

  release(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
  }

  get current(): number {
    return this.inFlight;
  }
}

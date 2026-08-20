import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { loadNodeFrankingKeys, type NodeFrankingKeySnapshot } from '@patches/database';
import type { DataSource } from 'typeorm';

import { type NodeFrankingKeyRing } from './report-evidence.js';

/**
 * The explicit DI token `E2eeReportEvidenceService`/`E2eeConversationService` inject
 * `NodeFrankingKeyRing` with. `NodeFrankingKeyRing` is an interface — `emitDecoratorMetadata`
 * cannot emit an interface as a usable provider token (it records `Object`), so a bare
 * constructor-parameter type never resolves. This took production down once (see
 * `apps/server/src/di-graph.test.ts`'s doc comment); every consumer of this key ring must use
 * `@Inject(NODE_FRANKING_KEY_RING)`, never rely on the parameter's declared type.
 */
export const NODE_FRANKING_KEY_RING = 'NODE_FRANKING_KEY_RING';

/**
 * How often the in-process cache re-reads `e2ee_node_franking_keys`. `apps/worker`'s rotation
 * handler runs in a separate process, so a newly minted era becomes visible to this node's own
 * signing/verification path only after the next refresh — not instantly. 5 minutes bounds that
 * lag to something far shorter than the rotation interval itself
 * (`apps/worker/src/jobs/handlers/rotate-e2ee-franking-key.handler.ts`), so it is not a
 * correctness concern, only a startup/rotation-adjacent latency one.
 */
const CACHE_REFRESH_INTERVAL_MS = 5 * 60_000;

/**
 * Persisted node franking-key custody (ADR 0020 §9, §12.7, P13-015) — the production
 * `NodeFrankingKeyRing`, replacing `EnvNodeFrankingKeyRing`. Backed by `e2ee_node_franking_keys`
 * (`packages/database`), which `apps/worker`'s `E2EE_ROTATE_FRANKING_KEY` job mints new eras
 * into on a schedule.
 *
 * `NodeFrankingKeyRing`'s methods are synchronous (existing contract, shared with
 * `e2ee-fanout.ts`'s hot signing path) but the source of truth is a database row, so this class
 * keeps an in-memory snapshot loaded at boot (`onModuleInit`) and refreshed on a timer — never
 * read per-call, which would make every `AttachReportEvidence`/`SendEnvelopes` call a surprise
 * extra query. `knownEras()`/`keyForEra()` include **every** era this node has ever minted, not
 * just the current one: ADR 0020 §12.7 requires that verifying an old tag still resolve the era
 * it was signed under, and rotation must never invalidate a previously issued tag.
 */
@Injectable()
export class DatabaseNodeFrankingKeyRing
  implements NodeFrankingKeyRing, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(DatabaseNodeFrankingKeyRing.name);
  #keys: ReadonlyMap<number, Uint8Array> = new Map();
  #currentEra: number | undefined;
  #refreshTimer: ReturnType<typeof setInterval> | undefined;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    await this.refresh();
    // `unref()` so this timer never keeps the process alive on its own (same reasoning as
    // `JobRunner`'s interruptible sleep not blocking shutdown) — worker/server shutdown already
    // has its own explicit `dataSource.destroy()` sequencing.
    this.#refreshTimer = setInterval(() => {
      this.refresh().catch((error: unknown) => {
        // Never log key material — only the fact that a refresh failed (§101, §183.1). A failed
        // refresh leaves the previous, still-valid snapshot in place rather than clearing it.
        this.logger.warn(
          `Failed to refresh node franking keys: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }, CACHE_REFRESH_INTERVAL_MS);
    this.#refreshTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.#refreshTimer !== undefined) clearInterval(this.#refreshTimer);
  }

  /** Re-reads every known era from `e2ee_node_franking_keys`. Exposed (not just called
   * internally) so tests can force a synchronous refresh after seeding/rotating a key, instead
   * of waiting out `CACHE_REFRESH_INTERVAL_MS`. */
  async refresh(): Promise<void> {
    const rows: NodeFrankingKeySnapshot[] = await loadNodeFrankingKeys(this.dataSource.manager);
    const keys = new Map<number, Uint8Array>();
    let currentEra: number | undefined;
    for (const row of rows) {
      keys.set(row.era, new Uint8Array(row.keyMaterial));
      if (currentEra === undefined || row.era > currentEra) currentEra = row.era;
    }
    this.#keys = keys;
    this.#currentEra = currentEra;
  }

  keyForEra(era: number): Uint8Array | undefined {
    return this.#keys.get(era);
  }

  knownEras(): readonly number[] {
    return [...this.#keys.keys()];
  }

  currentEra(): number | undefined {
    return this.#currentEra;
  }
}

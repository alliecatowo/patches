import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  type AttachReportEvidenceRequest,
  type AttachReportEvidenceResponse,
} from '@patches/proto/nest';
import { DataSource } from 'typeorm';

import { E2eeRateLimitService } from './e2ee-rate-limit.service.js';
import { NODE_FRANKING_KEY_RING } from './node-franking-key-ring.js';
import { attachReportEvidence, type NodeFrankingKeyRing } from './report-evidence.js';
import {
  loadReportEvidenceForModeration,
  type E2eeModerationEvidenceView,
} from './report-evidence-moderation.js';

/**
 * `E2eeService.AttachReportEvidence` (ADR 0020 §9, P13-009): moderation ingestion for
 * reporter-disclosed E2EE evidence. See `report-evidence.ts` for the actual verification logic —
 * this class only owns the transaction boundary and the node's franking-key material, the same
 * split `device-roster.service.ts`/`roster-chain.ts` use.
 */
@Injectable()
export class E2eeReportEvidenceService {
  readonly #keys: NodeFrankingKeyRing;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    // `@Inject(NODE_FRANKING_KEY_RING)` is load-bearing, not decoration. `NodeFrankingKeyRing`
    // is an interface, so `emitDecoratorMetadata` records its param type as `Object`, and Nest
    // tries to resolve that as a provider token if this were a bare, undecorated parameter — it
    // cannot, and the whole app fails to boot with "Nest can't resolve dependencies of the
    // E2eeReportEvidenceService (DataSource, ?)". This took prod down once (P13-009's
    // `@Optional()` default masked it instead of fixing it; P13-015 replaces that scaffolding
    // with a real explicit-token provider — see `apps/server/src/di-graph.test.ts` and
    // `node-franking-key-ring.ts`). Tests can still inject a fake positionally, bypassing Nest
    // entirely.
    @Inject(NODE_FRANKING_KEY_RING) keys: NodeFrankingKeyRing,
    private readonly rateLimits: E2eeRateLimitService,
  ) {
    this.#keys = keys;
  }

  async attachReportEvidence(
    actorId: string,
    request: AttachReportEvidenceRequest,
    peer: string | undefined = undefined,
  ): Promise<AttachReportEvidenceResponse> {
    // Same shape as the legacy report paths' budget (`ReportRateLimitService`, spec §102):
    // evidence disclosure is a reporter-initiated write and is rate-limited before any
    // verification work runs. Audit P1: this RPC previously had no limit at all.
    await this.rateLimits.consumeReportEvidence(actorId, peer);

    return this.dataSource.transaction((manager) =>
      attachReportEvidence(manager, actorId, request, this.#keys),
    );
  }

  /** See `loadReportEvidenceForModeration`'s doc comment — moderator-only, not currently
   * reachable from any RPC; the transaction boundary matches `attachReportEvidence` above. */
  async getReportEvidenceForModeration(
    reportId: string,
    moderatorUserId: string,
  ): Promise<E2eeModerationEvidenceView> {
    return this.dataSource.transaction((manager) =>
      loadReportEvidenceForModeration(manager, reportId, moderatorUserId),
    );
  }
}

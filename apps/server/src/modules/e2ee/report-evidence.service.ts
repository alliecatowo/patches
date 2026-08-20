import { Injectable, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  type AttachReportEvidenceRequest,
  type AttachReportEvidenceResponse,
} from '@patches/proto/nest';
import { DataSource } from 'typeorm';

import {
  attachReportEvidence,
  EnvNodeFrankingKeyRing,
  type NodeFrankingKeyRing,
} from './report-evidence.js';

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
    // `@Optional()` is load-bearing, not decoration. `NodeFrankingKeyRing` is an interface, so
    // `emitDecoratorMetadata` records its param type as `Object`, and Nest tries to resolve
    // that as a provider token regardless of the default value — it cannot, and the whole app
    // fails to boot with "Nest can't resolve dependencies of the E2eeReportEvidenceService
    // (DataSource, ?)". This took prod down once. `@Optional()` makes Nest pass `undefined`,
    // which lets the default apply, while tests can still inject a fake positionally.
    @Optional() keys: NodeFrankingKeyRing = new EnvNodeFrankingKeyRing(),
  ) {
    this.#keys = keys;
  }

  async attachReportEvidence(
    actorId: string,
    request: AttachReportEvidenceRequest,
  ): Promise<AttachReportEvidenceResponse> {
    return this.dataSource.transaction((manager) =>
      attachReportEvidence(manager, actorId, request, this.#keys),
    );
  }
}

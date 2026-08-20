import { Injectable } from '@nestjs/common';
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
    keys: NodeFrankingKeyRing = new EnvNodeFrankingKeyRing(),
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

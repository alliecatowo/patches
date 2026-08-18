import { Injectable } from '@nestjs/common';
import { DomainBlock } from '@patches/database';
import type { EntityManager } from 'typeorm';

/** `domain_blocks` reads (P8-006 — enforced both directions: inbound activities from a
 * blocked domain are rejected by `InboxService`, and `DeliveryService`'s callers never
 * enqueue a delivery to one — `ActivityPubFederationGateway`'s recipient-resolution queries
 * would need to additionally filter on this to fully close the outbound half; see this
 * task's report for that follow-up). Writes are an operator/admin-CLI concern outside this
 * task's scope, same as `domain_blocks`' sibling `blocks` table's `BlockActor`/`UnblockActor`
 * RPCs (spec §140, Phase 6). */
@Injectable()
export class DomainBlockService {
  async isBlocked(manager: EntityManager, domain: string): Promise<boolean> {
    const row = await manager
      .getRepository(DomainBlock)
      .findOne({ where: { domain: domain.toLowerCase() } });
    return row !== null;
  }
}

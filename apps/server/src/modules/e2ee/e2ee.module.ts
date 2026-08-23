import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { E2eeCapabilityService } from './e2ee-capability.service.js';
import { E2eeConversationService } from './e2ee-conversation.service.js';
import { E2eeDeviceRosterService } from './device-roster.service.js';
import { E2eeController } from './e2ee.controller.js';
import { E2eeGroupService } from './group-control.service.js';
import { E2eeIdentityRootService } from './identity-root.service.js';
import { DatabaseNodeFrankingKeyRing, NODE_FRANKING_KEY_RING } from './node-franking-key-ring.js';
import { E2eePrekeyService } from './prekey.service.js';
import { E2eeReportEvidenceService } from './report-evidence.service.js';
import { E2eeRuntimeApprovalModule } from './e2ee-runtime-approval.module.js';

/**
 * `patches.v1.E2eeService`'s account-root/device/prekey lifecycle (ADR 0020, P13-004/P13-005).
 * Local-node only, exactly like `MessagesModule` — nothing here imports `FederationModule`
 * (ADR 0020 §13: federated E2EE DMs remain prohibited).
 *
 * `NODE_FRANKING_KEY_RING` (P13-015) is the one production `NodeFrankingKeyRing` binding —
 * `DatabaseNodeFrankingKeyRing`, backed by `e2ee_node_franking_keys` — that
 * `E2eeConversationService`/`E2eeReportEvidenceService` both inject via `@Inject`, never via the
 * bare interface type (`node-franking-key-ring.ts`'s doc comment explains why).
 */
@Module({
  imports: [AuthModule, E2eeRuntimeApprovalModule],
  controllers: [E2eeController],
  providers: [
    E2eeIdentityRootService,
    E2eeDeviceRosterService,
    E2eePrekeyService,
    E2eeCapabilityService,
    E2eeConversationService,
    E2eeGroupService,
    E2eeReportEvidenceService,
    { provide: NODE_FRANKING_KEY_RING, useClass: DatabaseNodeFrankingKeyRing },
  ],
})
export class E2eeModule {}

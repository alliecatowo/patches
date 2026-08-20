import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { E2eeConversationService } from './e2ee-conversation.service.js';
import { E2eeDeviceRosterService } from './device-roster.service.js';
import { E2eeController } from './e2ee.controller.js';
import { E2eeIdentityRootService } from './identity-root.service.js';
import { E2eePrekeyService } from './prekey.service.js';
import { E2eeReportEvidenceService } from './report-evidence.service.js';

/**
 * `patches.v1.E2eeService`'s account-root/device/prekey lifecycle (ADR 0020, P13-004/P13-005).
 * Local-node only, exactly like `MessagesModule` — nothing here imports `FederationModule`
 * (ADR 0020 §13: federated E2EE DMs remain prohibited).
 */
@Module({
  imports: [AuthModule],
  controllers: [E2eeController],
  providers: [
    E2eeIdentityRootService,
    E2eeDeviceRosterService,
    E2eePrekeyService,
    E2eeConversationService,
    E2eeReportEvidenceService,
  ],
})
export class E2eeModule {}

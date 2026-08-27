import { Module } from '@nestjs/common';

import { AppConfigModule } from '../../config/config.module.js';
import { AppConfigService } from '../../config/app-config.service.js';
import {
  E2EE_RUNTIME_APPROVAL_POLICY,
  E2eeRuntimeApprovalPolicy,
} from './e2ee-runtime-approval-policy.js';

/** The one server-wide instance of the E2EE franking-profile runtime approval decision. */
@Module({
  imports: [AppConfigModule],
  providers: [
    {
      provide: E2EE_RUNTIME_APPROVAL_POLICY,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        new E2eeRuntimeApprovalPolicy(config.e2eeApprovedFrankingProfiles),
    },
  ],
  exports: [E2EE_RUNTIME_APPROVAL_POLICY],
})
export class E2eeRuntimeApprovalModule {}

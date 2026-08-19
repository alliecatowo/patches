import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { LabelController } from './label.controller.js';
import { LabelSeedService } from './label-seed.service.js';
import { LabelService } from './label.service.js';

/** Labelers and labels (spec §200): closed-vocabulary annotation, subscriber-scoped, never
 * global truth. Exports `LabelService` so `feeds/post-batch.ts`'s non-DI `labelsForPosts`
 * helper's DI-facing counterpart is reachable from other modules (e.g. a future filter/label
 * evaluation chokepoint) without them owning a second copy of the visibility rule. */
@Module({
  imports: [AuthModule],
  controllers: [LabelController],
  providers: [LabelService, LabelSeedService],
  exports: [LabelService],
})
export class LabelsModule {}

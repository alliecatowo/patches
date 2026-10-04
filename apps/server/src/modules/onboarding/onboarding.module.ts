import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { GraphModule } from '../graph/graph.module.js';
import { PostModule } from '../posts/post.module.js';
import { ReactionModule } from '../reactions/reaction.module.js';
import { DemoSandboxService } from './demo-sandbox.service.js';
import { OnboardingController } from './onboarding.controller.js';

/**
 * Landing-page onboarding (ADR 0044): the per-visitor demo sandbox and, in a follow-up,
 * invite requests. The sandbox only does anything when `DEMO_MODE=true`.
 */
@Module({
  imports: [AuthModule, PostModule, GraphModule, ReactionModule],
  controllers: [OnboardingController],
  providers: [DemoSandboxService],
})
export class OnboardingModule {}

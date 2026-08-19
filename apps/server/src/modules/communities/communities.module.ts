import { Module } from '@nestjs/common';

import { AppConfigModule } from '../../config/config.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notification.module.js';
import { CommunityController } from './community.controller.js';
import { CommunityService } from './community.service.js';

/** Local, chronological communities and community-scoped moderation (§182). */
@Module({
  imports: [AppConfigModule, AuthModule, NotificationsModule],
  controllers: [CommunityController],
  providers: [CommunityService],
})
export class CommunitiesModule {}

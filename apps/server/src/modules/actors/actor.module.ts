import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { ActorController } from './actor.controller.js';
import { ActorService } from './actor.service.js';

/** Actor profiles (spec §19, §21, §49). `AuthModule` is imported for `AuthGuard`. */
@Module({
  imports: [AuthModule],
  controllers: [ActorController],
  providers: [ActorService],
  exports: [ActorService],
})
export class ActorModule {}

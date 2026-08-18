import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { PostController } from './post.controller.js';
import { PostService } from './post.service.js';

/** Posts and replies (spec §23–26, §45, §51). `AuthModule` is imported for `AuthGuard`. */
@Module({
  imports: [AuthModule],
  controllers: [PostController],
  providers: [PostService],
})
export class PostModule {}

import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { TagController } from './tag.controller.js';
import { TagExtractionService } from './tag-extraction.service.js';
import { TagService } from './tag.service.js';

/**
 * Hashtags: search, mutes, and write-time extraction (spec §181). `TagExtractionService` is
 * exported so `PostModule` (P11-006) can inject it — a tag-extraction failure must never fail
 * a post, so the hook lives on the writer's own transaction rather than this module owning
 * any part of `PostService`'s call path.
 */
@Module({
  imports: [AuthModule],
  controllers: [TagController],
  providers: [TagService, TagExtractionService],
  exports: [TagExtractionService],
})
export class TagsModule {}

import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { FilterController } from './filter.controller.js';
import { FilterService } from './filter.service.js';

/**
 * Bring-your-own filters (spec §198). `filter-matching.ts`'s evaluation helpers are plain
 * functions taking a `DataSource` directly — `FeedService` calls them without a Nest
 * dependency on this module, the same way `feeds/feed.service.ts` already reuses
 * `tags/tag-extraction.service.ts#parseTags` as a plain import.
 */
@Module({
  imports: [AuthModule],
  controllers: [FilterController],
  providers: [FilterService],
})
export class FiltersModule {}

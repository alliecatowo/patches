import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { FilterListController } from './filter-list.controller.js';
import { FilterListService } from './filter-list.service.js';

/** Filter lists (spec §199) — the decentralized publish/subscribe primitive. */
@Module({
  imports: [AuthModule],
  controllers: [FilterListController],
  providers: [FilterListService],
})
export class FilterListsModule {}

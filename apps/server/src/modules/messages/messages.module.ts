import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { MessagesController } from './messages.controller.js';
import { MessagesService } from './messages.service.js';

/** The generic conversation surface — listing, reading, membership, read-state. Local-only,
 * intentionally imports no federation module (ADR 0020 §13). */
@Module({
  imports: [AuthModule],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}

import { Module } from '@nestjs/common';

import { serverVersionProvider } from './server-version.provider.js';
import { SystemController } from './system.controller.js';
import { SystemService } from './system.service.js';

@Module({
  controllers: [SystemController],
  providers: [SystemService, serverVersionProvider],
  exports: [SystemService],
})
export class SystemModule {}

import { Module } from '@nestjs/common';

import { NodeController } from './node.controller.js';
import { NodeService } from './node.service.js';
import { serverVersionProvider } from './server-version.provider.js';
import { SystemController } from './system.controller.js';
import { SystemService } from './system.service.js';

/** `SystemService` (build/version/liveness) and `NodeService` (node discovery, spec §163,
 * §168) share this module: both are small, unauthenticated, config-driven services with no
 * feature-specific dependencies of their own. */
@Module({
  controllers: [SystemController, NodeController],
  providers: [SystemService, NodeService, serverVersionProvider],
  exports: [SystemService],
})
export class SystemModule {}

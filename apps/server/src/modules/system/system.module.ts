import { Module } from '@nestjs/common';

import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';
import { NodeController } from './node.controller.js';
import { NodeService } from './node.service.js';
import { ReadinessState } from './readiness-state.js';
import { serverVersionProvider } from './server-version.provider.js';
import { SystemController } from './system.controller.js';
import { SystemService } from './system.service.js';

/** `SystemService` (build/version/liveness), `NodeService` (node discovery, spec §163,
 * §168) and `HealthService`/`ReadinessState` (`GET /healthz`, A-043) share this module: all
 * are small, config-driven services with no feature-specific dependencies of their own.
 * `HealthService` and `ReadinessState` are exported so `main.ts` and the standalone
 * `healthz-server.ts` listener can resolve them via `app.get(...)` without going through
 * `HealthController` (see `healthz-server.ts` for why that route isn't always bound). */
@Module({
  controllers: [SystemController, NodeController, HealthController],
  providers: [SystemService, NodeService, serverVersionProvider, HealthService, ReadinessState],
  exports: [SystemService, HealthService, ReadinessState],
})
export class SystemModule {}

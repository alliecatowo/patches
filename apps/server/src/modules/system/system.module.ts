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
 * `ReadinessState` is also exported so `main.ts` can resolve it via `app.get(...)` to flip
 * readiness during shutdown (`HealthController` reads it indirectly, through
 * `HealthService`). */
@Module({
  controllers: [SystemController, NodeController, HealthController],
  providers: [SystemService, NodeService, serverVersionProvider, HealthService, ReadinessState],
  // No exports: every consumer is same-module (controllers above) or resolves via
  // `app.get()` (ReadinessState in main.ts), neither of which needs a module export.
})
export class SystemModule {}

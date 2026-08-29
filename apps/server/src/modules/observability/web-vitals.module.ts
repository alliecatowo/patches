import { Module } from '@nestjs/common';

import { WebVitalsController } from './web-vitals.controller.js';
import { WebVitalsRateLimiterService } from './web-vitals-rate-limiter.service.js';
import { WebVitalsService } from './web-vitals.service.js';

/** B-182 — always registered (unlike `FederationHttpModule`, this surface has no feature
 * flag to gate on: it's a same-node telemetry sink, not a federation-network exposure). */
@Module({
  controllers: [WebVitalsController],
  providers: [WebVitalsRateLimiterService, WebVitalsService],
})
export class WebVitalsModule {}

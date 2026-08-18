import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service.js';
import { NotificationsModule } from '../notifications/notification.module.js';
import { MAX_INBOUND_BODY_BYTES } from './federation.constants.js';
import { FEDERATION_GATEWAY, NoopFederationGateway } from './federation-gateway.js';
import { ActorController } from './http/actor.controller.js';
import { InboxController } from './http/inbox.controller.js';
import { OutboxController } from './http/outbox.controller.js';
import { rawBodyCollector } from './http/raw-body.middleware.js';
import { WebfingerController } from './http/webfinger.controller.js';
import { PeerRateLimiterService } from './security/peer-rate-limiter.service.js';
import { ActivityPubFederationGateway } from './services/activitypub-federation-gateway.service.js';
import { ActorDocumentService } from './services/actor-document.service.js';
import { DeliveryService } from './services/delivery.service.js';
import { DomainBlockService } from './services/domain-block.service.js';
import { InboxService } from './services/inbox.service.js';
import { KeyService } from './services/key.service.js';
import { OutboxCollectionService } from './services/outbox-collection.service.js';
import { RemoteActorService } from './services/remote-actor.service.js';
import { WebfingerService } from './services/webfinger.service.js';

/**
 * The federation HTTP surface + the `FederationGateway` real implementation (P8-001..P8-008).
 * Registered unconditionally in `AppModule` — what actually gates any of this being reachable
 * is `main.ts` only opening the HTTP listener when `FEDERATION_ENABLED=true` (spec §176's
 * "self-hosted node ships with federation disabled by default"). `FEDERATION_GATEWAY` itself
 * is bound to `ActivityPubFederationGateway` when enabled and `NoopFederationGateway`
 * otherwise, so `GraphService`/`PostService`/`ReactionsService` never need to know which.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [WebfingerController, ActorController, OutboxController, InboxController],
  providers: [
    KeyService,
    RemoteActorService,
    DeliveryService,
    DomainBlockService,
    InboxService,
    OutboxCollectionService,
    ActorDocumentService,
    WebfingerService,
    PeerRateLimiterService,
    ActivityPubFederationGateway,
    {
      provide: FEDERATION_GATEWAY,
      inject: [AppConfigService, ActivityPubFederationGateway],
      useFactory: (config: AppConfigService, real: ActivityPubFederationGateway) =>
        config.federationEnabled ? real : new NoopFederationGateway(),
    },
  ],
  exports: [FEDERATION_GATEWAY],
})
export class FederationModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(rawBodyCollector(MAX_INBOUND_BODY_BYTES)).forRoutes('*');
  }
}

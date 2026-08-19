import { type Metadata } from '@grpc/grpc-js';
import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ActorPrivacyPrefs } from '@patches/database';
import { DataSource } from 'typeorm';

import { AppConfigService } from '../../config/app-config.service.js';
import { getSessionClaims } from '../../modules/auth/session-context.js';
import { AppError } from '../errors/app-error.js';

/**
 * `AuthGuard`'s companion for gating mutating RPCs behind a node-published privacy notice
 * (P14 follow-up, spec §197.5, §197.6). Attach at the method level, **after** `AuthGuard`
 * (`@UseGuards(AuthGuard, RequirePrivacyAckGuard)`, or on a controller that already has
 * `AuthGuard` at the class level, `@UseGuards(RequirePrivacyAckGuard)` on the individual
 * write method) — it reads the session claims `AuthGuard` sets, and Nest runs guards in the
 * order they are listed, class-level before method-level.
 *
 * A no-op whenever `REQUIRE_PRIVACY_ACK=false` (the default — see `env.schema.ts`'s doc
 * comment for why): the common case of "this node has published no privacy notice at all"
 * must never be gated. When enabled, an actor who has not called `PrivacyService.
 * AcknowledgePrivacyNotice` for this node's *current* `PRIVACY_NOTICE_VERSION` — including one
 * who acknowledged an older version, since a version bump means the notice text changed —
 * gets `FAILED_PRECONDITION`/`PRIVACY_NOTICE_NOT_ACKNOWLEDGED` instead of the RPC running.
 * Reads are never gated: this guard is only ever attached to a write RPC, never to a whole
 * controller.
 *
 * Attached to `PostController.createPost`, `MessagesController.sendMessage`/
 * `createConversation`, `GraphController.followActor`, and
 * `CommunityController.createCommunity`/`joinCommunity`. Posting *into* a community goes
 * through `PostController.createPost` (which sets `communityId`), so it is already covered
 * without a separate attachment on `CommunityController`.
 */
@Injectable()
export class RequirePrivacyAckGuard implements CanActivate {
  constructor(
    private readonly config: AppConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.config.requirePrivacyAck) return true;

    const call = context.switchToRpc().getContext<Metadata>();
    const claims = getSessionClaims(call);
    if (claims === undefined) {
      // Only reachable if this guard is ever attached without `AuthGuard` running first — a
      // wiring mistake, not a real client-facing case (`AuthGuard` always rejects first
      // otherwise).
      throw new AppError('AUTH_INVALID_CREDENTIALS', 'Authentication required.');
    }

    const prefs = await this.dataSource.getRepository(ActorPrivacyPrefs).findOne({
      where: { actorId: claims.actorId },
      select: { privacyNoticeVersion: true },
    });
    if (prefs?.privacyNoticeVersion !== this.config.privacyNoticeVersion) {
      throw new AppError(
        'PRIVACY_NOTICE_NOT_ACKNOWLEDGED',
        'You must acknowledge this node’s current privacy notice before continuing.',
      );
    }

    return true;
  }
}

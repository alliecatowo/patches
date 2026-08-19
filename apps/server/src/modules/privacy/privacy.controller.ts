import { type Metadata } from '@grpc/grpc-js';
import { Controller, UseGuards } from '@nestjs/common';
import { Ctx, Payload } from '@nestjs/microservices';
import {
  type AcknowledgePrivacyNoticeRequest,
  type AcknowledgePrivacyNoticeResponse,
  type CancelAccountDeletionRequest,
  type CancelAccountDeletionResponse,
  type ExportAccountRequest,
  type ExportAccountResponse,
  type GetDeletionStatusRequest,
  type GetDeletionStatusResponse,
  type GetExportStatusRequest,
  type GetExportStatusResponse,
  type GetPrivacyPrefsRequest,
  type GetPrivacyPrefsResponse,
  type PrivacyServiceController,
  PrivacyServiceControllerMethods,
  type RequestAccountDeletionRequest,
  type RequestAccountDeletionResponse,
  type UpdatePrivacyPrefsRequest,
  type UpdatePrivacyPrefsResponse,
} from '@patches/proto/nest';

import { AppError } from '../../common/errors/app-error.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentSession } from '../auth/session-context.js';
import { type AccessTokenClaims } from '../auth/token.service.js';
import {
  toProtoAccountDeletionStatus,
  toProtoAccountExport,
  toProtoPrivacyPrefs,
} from './privacy.mapper.js';
import { PrivacyService } from './privacy.service.js';

/**
 * Transport adapter for `patches.v1.PrivacyService` (spec §128) — every RPC here requires an
 * authenticated session and always acts on the caller's own account; there is no "look up
 * someone else's privacy prefs/export/deletion status" path anywhere in this contract.
 */
@Controller()
@PrivacyServiceControllerMethods()
@UseGuards(AuthGuard)
export class PrivacyController implements PrivacyServiceController {
  constructor(private readonly privacy: PrivacyService) {}

  async acknowledgePrivacyNotice(
    @Payload() request: AcknowledgePrivacyNoticeRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<AcknowledgePrivacyNoticeResponse> {
    const prefs = await this.privacy.acknowledgePrivacyNotice(
      requireSession(session).actorId,
      request.noticeVersion,
    );
    return { prefs: toProtoPrivacyPrefs(prefs) };
  }

  async getPrivacyPrefs(
    @Payload() _request: GetPrivacyPrefsRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<GetPrivacyPrefsResponse> {
    const prefs = await this.privacy.getPrivacyPrefs(requireSession(session).actorId);
    return { prefs: toProtoPrivacyPrefs(prefs) };
  }

  async updatePrivacyPrefs(
    @Payload() request: UpdatePrivacyPrefsRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<UpdatePrivacyPrefsResponse> {
    const prefs = await this.privacy.updatePrivacyPrefs({
      actorId: requireSession(session).actorId,
      discoverable: request.discoverable,
      indexable: request.indexable,
      showInLocalFeed: request.showInLocalFeed,
      locked: request.locked,
      updateMask: fieldMaskPaths(request.updateMask),
    });
    return { prefs: toProtoPrivacyPrefs(prefs) };
  }

  async exportAccount(
    @Payload() _request: ExportAccountRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<ExportAccountResponse> {
    const view = await this.privacy.exportAccount(requireSession(session).actorId);
    return { export: toProtoAccountExport(view) };
  }

  async getExportStatus(
    @Payload() _request: GetExportStatusRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<GetExportStatusResponse> {
    const view = await this.privacy.getExportStatus(requireSession(session).actorId);
    return { export: view === null ? undefined : toProtoAccountExport(view) };
  }

  async requestAccountDeletion(
    @Payload() _request: RequestAccountDeletionRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<RequestAccountDeletionResponse> {
    const claims = requireSession(session);
    const deletion = await this.privacy.requestAccountDeletion(claims.actorId, claims.userId);
    return { deletion: toProtoAccountDeletionStatus(deletion) };
  }

  async cancelAccountDeletion(
    @Payload() _request: CancelAccountDeletionRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<CancelAccountDeletionResponse> {
    const deletion = await this.privacy.cancelAccountDeletion(requireSession(session).actorId);
    return { deletion: toProtoAccountDeletionStatus(deletion) };
  }

  async getDeletionStatus(
    @Payload() _request: GetDeletionStatusRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<GetDeletionStatusResponse> {
    const deletion = await this.privacy.getDeletionStatus(requireSession(session).actorId);
    return { deletion: toProtoAccountDeletionStatus(deletion) };
  }
}

function requireSession(session: AccessTokenClaims | undefined): AccessTokenClaims {
  if (session === undefined) {
    throw new AppError('AUTH_INVALID_CREDENTIALS', 'Authentication required.');
  }
  return session;
}

/**
 * `@grpc/proto-loader` decodes `google.protobuf.FieldMask` as its literal wire shape,
 * `{ paths: string[] }`, not the flat `string[]` ts-proto's generated type claims (see
 * `docs/agents/LEARNINGS.md`: proto-fieldmask-wire-shape, and `actors/actor.controller.ts`'s
 * identical helper). Both shapes are accepted so this keeps working if that ever changes.
 */
function fieldMaskPaths(mask: unknown): string[] {
  if (Array.isArray(mask)) return mask as string[];
  if (typeof mask === 'object' && mask !== null && 'paths' in mask) {
    const paths = (mask as { paths?: unknown }).paths;
    if (Array.isArray(paths)) return paths as string[];
  }
  return [];
}

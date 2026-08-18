import { type Metadata } from '@grpc/grpc-js';
import { Controller, UseGuards } from '@nestjs/common';
import { Ctx, Payload } from '@nestjs/microservices';
import {
  type BeginMediaUploadRequest,
  type BeginMediaUploadResponse,
  type FinalizeMediaUploadRequest,
  type FinalizeMediaUploadResponse,
  type GetMediaDownloadRequest,
  type GetMediaDownloadResponse,
  type MediaServiceController,
  MediaServiceControllerMethods,
} from '@patches/proto/nest';

import { AppError } from '../../common/errors/app-error.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentSession } from '../auth/session-context.js';
import { type AccessTokenClaims } from '../auth/token.service.js';
import { dateToTimestamp } from '@patches/proto';
import { toProtoMediaStatus } from './media.mapper.js';
import { MediaService } from './media.service.js';
import { parseByteSize } from './validation.js';

/**
 * Transport adapter for `patches.v1.MediaService` — protobuf in, protobuf out, no business
 * logic (spec §128). Every RPC requires an authenticated session: there is no anonymous
 * upload/download in v0.
 */
@Controller()
@MediaServiceControllerMethods()
export class MediaController implements MediaServiceController {
  constructor(private readonly media: MediaService) {}

  @UseGuards(AuthGuard)
  async beginMediaUpload(
    @Payload() request: BeginMediaUploadRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<BeginMediaUploadResponse> {
    const result = await this.media.beginMediaUpload({
      actorId: requireSession(session).actorId,
      mimeType: request.mimeType,
      byteSize: parseByteSize(request.byteSize),
      sha256: request.sha256,
    });
    return {
      mediaId: result.mediaId,
      uploadUrl: result.uploadUrl,
      expiresAt: dateToTimestamp(result.expiresAt),
    };
  }

  @UseGuards(AuthGuard)
  async finalizeMediaUpload(
    @Payload() request: FinalizeMediaUploadRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<FinalizeMediaUploadResponse> {
    const result = await this.media.finalizeMediaUpload(
      requireSession(session).actorId,
      request.mediaId,
    );
    return { mediaId: result.mediaId, status: toProtoMediaStatus(result.state) };
  }

  @UseGuards(AuthGuard)
  async getMediaDownload(
    @Payload() request: GetMediaDownloadRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() _session?: AccessTokenClaims,
  ): Promise<GetMediaDownloadResponse> {
    const view = await this.media.getMediaDownload(request.mediaId);
    return {
      mediaId: view.mediaId,
      status: toProtoMediaStatus(view.state),
      mimeType: view.mimeType,
      width: view.width,
      height: view.height,
      downloadUrl: view.downloadUrl,
      thumbnailUrl: view.thumbnailUrl,
      expiresAt: dateToTimestamp(view.expiresAt),
    };
  }
}

function requireSession(session: AccessTokenClaims | undefined): AccessTokenClaims {
  if (session === undefined) {
    throw new AppError('AUTH_INVALID_CREDENTIALS', 'Authentication required.');
  }
  return session;
}

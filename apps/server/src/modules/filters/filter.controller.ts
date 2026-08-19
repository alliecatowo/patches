import { type Metadata } from '@grpc/grpc-js';
import { Controller, UseGuards } from '@nestjs/common';
import { Ctx, Payload } from '@nestjs/microservices';
import {
  type CreateFilterRequest,
  type CreateFilterResponse,
  type DeleteFilterRequest,
  type DeleteFilterResponse,
  type ExportFiltersRequest,
  type ExportFiltersResponse,
  type Filter as ProtoFilter,
  type FilterServiceController,
  FilterServiceControllerMethods,
  type ImportFiltersRequest,
  type ImportFiltersResponse,
  type ListFiltersRequest,
  type ListFiltersResponse,
  type UpdateFilterRequest,
  type UpdateFilterResponse,
} from '@patches/proto/nest';

import { AppError } from '../../common/errors/app-error.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentSession } from '../auth/session-context.js';
import { type AccessTokenClaims } from '../auth/token.service.js';
import { type FilterListPage } from './filter.dto.js';
import { FilterService } from './filter.service.js';
import { toProtoFilter } from './filter.mapper.js';

/** Transport adapter for `patches.v1.FilterService` (spec §128) — every RPC requires an
 * authenticated session: a filter is viewer-owned and there is no anonymous read of it
 * (unlike, say, `TagService.SearchTags`). */
@Controller()
@FilterServiceControllerMethods()
export class FilterController implements FilterServiceController {
  constructor(private readonly filters: FilterService) {}

  @UseGuards(AuthGuard)
  async createFilter(
    @Payload() request: CreateFilterRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<CreateFilterResponse> {
    const filter = await this.filters.createFilter({
      actorId: requireSession(session).actorId,
      name: request.name,
      terms: request.terms,
      scopes: request.scopes,
      action: request.action,
      expiresAt: request.expiresAt,
    });
    return { filter: toProtoFilter(filter) };
  }

  @UseGuards(AuthGuard)
  async updateFilter(
    @Payload() request: UpdateFilterRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<UpdateFilterResponse> {
    const filter = await this.filters.updateFilter({
      actorId: requireSession(session).actorId,
      id: request.id,
      name: request.name,
      terms: request.terms,
      scopes: request.scopes,
      action: request.action,
      expiresAt: request.expiresAt,
      updateMask: fieldMaskPaths(request.updateMask),
    });
    return { filter: toProtoFilter(filter) };
  }

  @UseGuards(AuthGuard)
  async deleteFilter(
    @Payload() request: DeleteFilterRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<DeleteFilterResponse> {
    await this.filters.deleteFilter(requireSession(session).actorId, request.id);
    return {};
  }

  @UseGuards(AuthGuard)
  async listFilters(
    @Payload() request: ListFiltersRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<ListFiltersResponse> {
    return toListResponse(
      await this.filters.listFilters(
        requireSession(session).actorId,
        request.cursor,
        request.limit,
      ),
    );
  }

  @UseGuards(AuthGuard)
  async exportFilters(
    @Payload() _request: ExportFiltersRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<ExportFiltersResponse> {
    return { json: await this.filters.exportFilters(requireSession(session).actorId) };
  }

  @UseGuards(AuthGuard)
  async importFilters(
    @Payload() request: ImportFiltersRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<ImportFiltersResponse> {
    const added = await this.filters.importFilters(
      requireSession(session).actorId,
      request.json,
      request.apply,
    );
    return { added: added.map(toProtoFilter) };
  }
}

function toListResponse(page: FilterListPage): {
  filters: ProtoFilter[];
  page: { nextCursor: string; hasMore: boolean };
} {
  return {
    filters: page.filters.map(toProtoFilter),
    page: { nextCursor: page.nextCursor, hasMore: page.hasMore },
  };
}

function fieldMaskPaths(mask: unknown): string[] {
  if (Array.isArray(mask)) return mask as string[];
  if (typeof mask === 'object' && mask !== null && 'paths' in mask) {
    const paths = (mask as { paths?: unknown }).paths;
    if (Array.isArray(paths)) return paths as string[];
  }
  return [];
}

function requireSession(session: AccessTokenClaims | undefined): AccessTokenClaims {
  if (session === undefined) {
    throw new AppError('AUTH_INVALID_CREDENTIALS', 'Authentication required.');
  }
  return session;
}

import { type Metadata } from '@grpc/grpc-js';
import { Controller, UseGuards } from '@nestjs/common';
import { Ctx, Payload } from '@nestjs/microservices';
import {
  type DeleteFilterListRequest,
  type DeleteFilterListResponse,
  type FilterList as ProtoFilterList,
  type FilterListEntry as ProtoFilterListEntry,
  type FilterListServiceController,
  FilterListServiceControllerMethods,
  type FilterListSubscription as ProtoFilterListSubscription,
  type GetFilterListRequest,
  type GetFilterListResponse,
  type ListFilterListEntriesRequest,
  type ListFilterListEntriesResponse,
  type ListFilterListsRequest,
  type ListFilterListsResponse,
  type ListFilterListSubscriptionsRequest,
  type ListFilterListSubscriptionsResponse,
  type PublishFilterListRequest,
  type PublishFilterListResponse,
  type SetFilterListEntryExceptionRequest,
  type SetFilterListEntryExceptionResponse,
  type SubscribeFilterListRequest,
  type SubscribeFilterListResponse,
  type UnsubscribeFilterListRequest,
  type UnsubscribeFilterListResponse,
  type UpdateFilterListRequest,
  type UpdateFilterListResponse,
} from '@patches/proto/nest';

import { AppError } from '../../common/errors/app-error.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentSession } from '../auth/session-context.js';
import { type AccessTokenClaims } from '../auth/token.service.js';
import {
  filterActionFromProtoWithCollapseDefault,
  filterScopeFromProto,
} from '../filters/filter-enums.js';
import type {
  FilterListEntryListPage,
  FilterListListPage,
  FilterListSubscriptionListPage,
} from './filter-list.dto.js';
import { FilterListService } from './filter-list.service.js';
import {
  toProtoFilterList,
  toProtoFilterListEntry,
  toProtoFilterListSubscription,
} from './filter-list.mapper.js';

/** Transport adapter for `patches.v1.FilterListService` (spec §128). Reads (`GetFilterList`,
 * `ListFilterLists`, `ListFilterListEntries`) are anonymous-readable — a list is public by
 * construction (§199.1) — every write requires an authenticated session. */
@Controller()
@FilterListServiceControllerMethods()
export class FilterListController implements FilterListServiceController {
  constructor(private readonly filterLists: FilterListService) {}

  @UseGuards(AuthGuard)
  async publishFilterList(
    @Payload() request: PublishFilterListRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<PublishFilterListResponse> {
    const filterList = await this.filterLists.publishFilterList({
      actorId: requireSession(session).actorId,
      name: request.name,
      displayName: request.displayName,
      description: request.description,
      ownerCommunityId: request.ownerCommunityId,
      entries: request.entries,
    });
    return { filterList: toProtoFilterList(filterList) };
  }

  @UseGuards(AuthGuard)
  async updateFilterList(
    @Payload() request: UpdateFilterListRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<UpdateFilterListResponse> {
    const filterList = await this.filterLists.updateFilterList({
      actorId: requireSession(session).actorId,
      id: request.id,
      displayName: request.displayName,
      description: request.description,
      entries: request.entries,
      updateMask: fieldMaskPaths(request.updateMask),
    });
    return { filterList: toProtoFilterList(filterList) };
  }

  @UseGuards(AuthGuard)
  async deleteFilterList(
    @Payload() request: DeleteFilterListRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<DeleteFilterListResponse> {
    await this.filterLists.deleteFilterList(requireSession(session).actorId, request.id);
    return {};
  }

  async getFilterList(@Payload() request: GetFilterListRequest): Promise<GetFilterListResponse> {
    return { filterList: toProtoFilterList(await this.filterLists.getFilterList(request.id)) };
  }

  async listFilterLists(
    @Payload() request: ListFilterListsRequest,
  ): Promise<ListFilterListsResponse> {
    return toFilterListListResponse(
      await this.filterLists.listFilterLists(request.ownerActorId, request.cursor, request.limit),
    );
  }

  async listFilterListEntries(
    @Payload() request: ListFilterListEntriesRequest,
  ): Promise<ListFilterListEntriesResponse> {
    return toFilterListEntryListResponse(
      await this.filterLists.listFilterListEntries(
        request.filterListId,
        request.cursor,
        request.limit,
      ),
    );
  }

  @UseGuards(AuthGuard)
  async subscribeFilterList(
    @Payload() request: SubscribeFilterListRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<SubscribeFilterListResponse> {
    const subscription = await this.filterLists.subscribeFilterList(
      requireSession(session).actorId,
      request.filterListId,
      filterActionFromProtoWithCollapseDefault(request.action),
      request.scopes.map(filterScopeFromProto),
    );
    return { subscription: toProtoFilterListSubscription(subscription) };
  }

  @UseGuards(AuthGuard)
  async unsubscribeFilterList(
    @Payload() request: UnsubscribeFilterListRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<UnsubscribeFilterListResponse> {
    await this.filterLists.unsubscribeFilterList(
      requireSession(session).actorId,
      request.filterListId,
    );
    return {};
  }

  @UseGuards(AuthGuard)
  async listFilterListSubscriptions(
    @Payload() request: ListFilterListSubscriptionsRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<ListFilterListSubscriptionsResponse> {
    return toSubscriptionListResponse(
      await this.filterLists.listFilterListSubscriptions(
        requireSession(session).actorId,
        request.cursor,
        request.limit,
      ),
    );
  }

  @UseGuards(AuthGuard)
  async setFilterListEntryException(
    @Payload() request: SetFilterListEntryExceptionRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<SetFilterListEntryExceptionResponse> {
    await this.filterLists.setFilterListEntryException(
      requireSession(session).actorId,
      request.filterListId,
      request.filterListEntryId,
      request.excepted,
    );
    return {};
  }
}

function toFilterListListResponse(page: FilterListListPage): {
  filterLists: ProtoFilterList[];
  page: { nextCursor: string; hasMore: boolean };
} {
  return {
    filterLists: page.filterLists.map(toProtoFilterList),
    page: { nextCursor: page.nextCursor, hasMore: page.hasMore },
  };
}

function toFilterListEntryListResponse(page: FilterListEntryListPage): {
  entries: ProtoFilterListEntry[];
  page: { nextCursor: string; hasMore: boolean };
} {
  return {
    entries: page.entries.map(toProtoFilterListEntry),
    page: { nextCursor: page.nextCursor, hasMore: page.hasMore },
  };
}

function toSubscriptionListResponse(page: FilterListSubscriptionListPage): {
  subscriptions: ProtoFilterListSubscription[];
  page: { nextCursor: string; hasMore: boolean };
} {
  return {
    subscriptions: page.subscriptions.map(toProtoFilterListSubscription),
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

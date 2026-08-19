import type {
  FilterAction as DbFilterAction,
  FilterScopeValue as DbFilterScope,
  FilterTermKind as DbFilterTermKind,
} from '@patches/database';

import type { ActorSummary } from '../auth/auth.dto.js';

/**
 * `FilterListService`'s own vocabulary (spec §128–129) — a `FilterList`/`FilterListEntry`/
 * `FilterListSubscription`/`FilterListException` entity never reaches a controller.
 */

/** `FilterList.owner_community` (`filter_lists.proto`) is the full `patches.v1.Community`
 * message, same "not loaded here" reasoning `posts/post.dto.ts#CommunitySummaryView` documents
 * for `Post.community` — this is a lightweight badge on a list, not
 * `CommunityService.GetCommunity`'s full projection, so `counts`/`viewer_role` are left unset
 * by the mapper rather than guessed at here. */
export interface FilterListCommunityOwnerView {
  id: string;
  name: string;
  displayName: string;
  description: string;
  rules: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface FilterListEntryView {
  id: string;
  kind: DbFilterTermKind;
  value: string;
  createdAt: Date;
}

export interface FilterListView {
  id: string;
  /** Exactly one of `ownerActor`/`ownerCommunity` is set (spec §199.1, the `filter_lists`
   * `CHECK exactly one owner column set` constraint). */
  ownerActor: ActorSummary | null;
  ownerCommunity: FilterListCommunityOwnerView | null;
  name: string;
  displayName: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FilterListSubscriptionView {
  filterList: FilterListView;
  action: DbFilterAction;
  /** Which of the subscriber's own viewing contexts this subscription's entries apply to
   * (spec §199.1, P14-022). Never empty — `FilterListService.subscribeFilterList` defaults an
   * empty request to every scope. */
  scopes: readonly DbFilterScope[];
  createdAt: Date;
}

export interface FilterListListPage {
  filterLists: FilterListView[];
  nextCursor: string;
  hasMore: boolean;
}

export interface FilterListEntryListPage {
  entries: FilterListEntryView[];
  nextCursor: string;
  hasMore: boolean;
}

export interface FilterListSubscriptionListPage {
  subscriptions: FilterListSubscriptionView[];
  nextCursor: string;
  hasMore: boolean;
}

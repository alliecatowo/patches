import type {
  FilterAction as DbFilterAction,
  FilterScopeValue as DbFilterScope,
  FilterTermKind as DbFilterTermKind,
} from '@patches/database';
import { FilterAction, FilterScope, FilterTermKind } from '@patches/proto/nest';

import { AppError } from '../../common/errors/app-error.js';

/**
 * Wire ⇄ database enum maps shared by `FilterService` and `FilterListService` — both proto
 * files reuse `FilterTermKind`/`FilterAction` verbatim (`filters.proto`'s doc comment,
 * `filter_lists.proto`'s import). One map each, not one per service.
 */

const TERM_KIND_TO_PROTO: Readonly<Record<DbFilterTermKind, FilterTermKind>> = Object.freeze({
  SUBSTRING: FilterTermKind.FILTER_TERM_KIND_SUBSTRING,
  WORD: FilterTermKind.FILTER_TERM_KIND_WORD,
  TAG: FilterTermKind.FILTER_TERM_KIND_TAG,
  ACTOR: FilterTermKind.FILTER_TERM_KIND_ACTOR,
  DOMAIN: FilterTermKind.FILTER_TERM_KIND_DOMAIN,
});

const PROTO_TO_TERM_KIND: Readonly<Partial<Record<FilterTermKind, DbFilterTermKind>>> =
  Object.freeze({
    [FilterTermKind.FILTER_TERM_KIND_SUBSTRING]: 'SUBSTRING',
    [FilterTermKind.FILTER_TERM_KIND_WORD]: 'WORD',
    [FilterTermKind.FILTER_TERM_KIND_TAG]: 'TAG',
    [FilterTermKind.FILTER_TERM_KIND_ACTOR]: 'ACTOR',
    [FilterTermKind.FILTER_TERM_KIND_DOMAIN]: 'DOMAIN',
  });

export function filterTermKindToProto(kind: DbFilterTermKind): FilterTermKind {
  return TERM_KIND_TO_PROTO[kind];
}

export function filterTermKindFromProto(value: FilterTermKind): DbFilterTermKind {
  const kind = PROTO_TO_TERM_KIND[value];
  if (kind === undefined) throw AppError.validation('term kind must be set.');
  return kind;
}

const SCOPE_TO_PROTO: Readonly<Record<DbFilterScope, FilterScope>> = Object.freeze({
  HOME: FilterScope.FILTER_SCOPE_HOME,
  LOCAL: FilterScope.FILTER_SCOPE_LOCAL,
  TAG_FEED: FilterScope.FILTER_SCOPE_TAG_FEED,
  COMMUNITY_FEED: FilterScope.FILTER_SCOPE_COMMUNITY_FEED,
  NOTIFICATIONS: FilterScope.FILTER_SCOPE_NOTIFICATIONS,
  SEARCH: FilterScope.FILTER_SCOPE_SEARCH,
  MESSAGE_REQUESTS: FilterScope.FILTER_SCOPE_MESSAGE_REQUESTS,
});

const PROTO_TO_SCOPE: Readonly<Partial<Record<FilterScope, DbFilterScope>>> = Object.freeze({
  [FilterScope.FILTER_SCOPE_HOME]: 'HOME',
  [FilterScope.FILTER_SCOPE_LOCAL]: 'LOCAL',
  [FilterScope.FILTER_SCOPE_TAG_FEED]: 'TAG_FEED',
  [FilterScope.FILTER_SCOPE_COMMUNITY_FEED]: 'COMMUNITY_FEED',
  [FilterScope.FILTER_SCOPE_NOTIFICATIONS]: 'NOTIFICATIONS',
  [FilterScope.FILTER_SCOPE_SEARCH]: 'SEARCH',
  [FilterScope.FILTER_SCOPE_MESSAGE_REQUESTS]: 'MESSAGE_REQUESTS',
});

export function filterScopeToProto(scope: DbFilterScope): FilterScope {
  return SCOPE_TO_PROTO[scope];
}

export function filterScopeFromProto(value: FilterScope): DbFilterScope {
  const scope = PROTO_TO_SCOPE[value];
  if (scope === undefined) throw AppError.validation('scope must be set.');
  return scope;
}

const ACTION_TO_PROTO: Readonly<Record<DbFilterAction, FilterAction>> = Object.freeze({
  HIDE: FilterAction.FILTER_ACTION_HIDE,
  COLLAPSE: FilterAction.FILTER_ACTION_COLLAPSE,
  WARN: FilterAction.FILTER_ACTION_WARN,
});

const PROTO_TO_ACTION: Readonly<Partial<Record<FilterAction, DbFilterAction>>> = Object.freeze({
  [FilterAction.FILTER_ACTION_HIDE]: 'HIDE',
  [FilterAction.FILTER_ACTION_COLLAPSE]: 'COLLAPSE',
  [FilterAction.FILTER_ACTION_WARN]: 'WARN',
});

export function filterActionToProto(action: DbFilterAction): FilterAction {
  return ACTION_TO_PROTO[action];
}

export function filterActionFromProto(value: FilterAction): DbFilterAction {
  const action = PROTO_TO_ACTION[value];
  if (action === undefined) throw AppError.validation('action must be set.');
  return action;
}

/** `SubscribeFilterListRequest.action` defaults to `collapse` when unspecified (spec §199.2 —
 * "defaulting to `collapse`, the least destructive useful action"). */
export function filterActionFromProtoWithCollapseDefault(value: FilterAction): DbFilterAction {
  if (value === FilterAction.FILTER_ACTION_UNSPECIFIED) return 'COLLAPSE';
  return filterActionFromProto(value);
}

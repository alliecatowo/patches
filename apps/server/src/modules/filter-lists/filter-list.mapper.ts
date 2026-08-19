import { dateToTimestamp } from '@patches/proto';
import type {
  Community as ProtoCommunity,
  FilterList as ProtoFilterList,
  FilterListEntry as ProtoFilterListEntry,
  FilterListSubscription as ProtoFilterListSubscription,
} from '@patches/proto';
import { CommunityRole } from '@patches/proto/nest';

import { toProtoActor } from '../auth/auth.mapper.js';
import { filterActionToProto, filterTermKindToProto } from '../filters/filter-enums.js';
import type {
  FilterListCommunityOwnerView,
  FilterListEntryView,
  FilterListSubscriptionView,
  FilterListView,
} from './filter-list.dto.js';

/** Application DTO → protobuf message (spec §128), field-by-field. */

function toProtoCommunityOwner(view: FilterListCommunityOwnerView): ProtoCommunity {
  return {
    id: view.id,
    name: view.name,
    displayName: view.displayName,
    description: view.description,
    rules: view.rules,
    createdBy: undefined,
    isPublic: view.isPublic,
    createdAt: dateToTimestamp(view.createdAt),
    updatedAt: dateToTimestamp(view.updatedAt),
    counts: undefined,
    viewerRole: CommunityRole.COMMUNITY_ROLE_UNSPECIFIED,
  };
}

export function toProtoFilterList(view: FilterListView): ProtoFilterList {
  return {
    id: view.id,
    ownerActor: view.ownerActor === null ? undefined : toProtoActor(view.ownerActor),
    ownerCommunity:
      view.ownerCommunity === null ? undefined : toProtoCommunityOwner(view.ownerCommunity),
    name: view.name,
    displayName: view.displayName,
    description: view.description,
    createdAt: dateToTimestamp(view.createdAt),
    updatedAt: dateToTimestamp(view.updatedAt),
  };
}

export function toProtoFilterListEntry(view: FilterListEntryView): ProtoFilterListEntry {
  return {
    id: view.id,
    kind: filterTermKindToProto(view.kind),
    value: view.value,
    createdAt: dateToTimestamp(view.createdAt),
  };
}

export function toProtoFilterListSubscription(
  view: FilterListSubscriptionView,
): ProtoFilterListSubscription {
  return {
    filterList: toProtoFilterList(view.filterList),
    action: filterActionToProto(view.action),
    createdAt: dateToTimestamp(view.createdAt),
  };
}

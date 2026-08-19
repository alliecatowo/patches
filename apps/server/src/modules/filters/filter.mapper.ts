import { dateToTimestamp } from '@patches/proto';
import type {
  Filter as ProtoFilter,
  FilteredByHint as ProtoFilteredByHint,
  FilterTerm as ProtoFilterTerm,
} from '@patches/proto';
import { FilteredByProvenance } from '@patches/proto/nest';

import { toProtoActor } from '../auth/auth.mapper.js';
import { filterActionToProto, filterScopeToProto, filterTermKindToProto } from './filter-enums.js';
import type { FilteredByHintView, FilterTermView, FilterView } from './filter.dto.js';

/** Application DTO → protobuf message (spec §128), field-by-field. */

export function toProtoFilterTerm(view: FilterTermView): ProtoFilterTerm {
  return { id: view.id, kind: filterTermKindToProto(view.kind), value: view.value };
}

export function toProtoFilter(view: FilterView): ProtoFilter {
  return {
    id: view.id,
    name: view.name,
    terms: view.terms.map(toProtoFilterTerm),
    scopes: view.scopes.map(filterScopeToProto),
    action: filterActionToProto(view.action),
    expiresAt: view.expiresAt === null ? undefined : dateToTimestamp(view.expiresAt),
    createdAt: dateToTimestamp(view.createdAt),
    updatedAt: dateToTimestamp(view.updatedAt),
  };
}

/** `Post.filtered_by` (spec §198.3, §199.3) — set only for a `collapse`/`warn` match, see
 * `filter.dto.ts#FilteredByHintView`'s doc. */
export function toProtoFilteredByHint(view: FilteredByHintView): ProtoFilteredByHint {
  return {
    provenance:
      view.provenance === 'FILTER'
        ? FilteredByProvenance.FILTERED_BY_PROVENANCE_FILTER
        : FilteredByProvenance.FILTERED_BY_PROVENANCE_FILTER_LIST,
    name: view.name,
    listOwner: view.listOwner === null ? undefined : toProtoActor(view.listOwner),
    action: filterActionToProto(view.action),
  };
}

import type {
  FilterAction as DbFilterAction,
  FilterScopeValue as DbFilterScope,
  FilterTermKind as DbFilterTermKind,
} from '@patches/database';

import type { ActorSummary } from '../auth/auth.dto.js';

/**
 * `FilterService`/`FilterListService`'s own vocabulary (spec §128–129) — a `Filter`/
 * `FilterTerm`/`FilterList`/`FilterListEntry` entity never reaches a controller.
 */

export interface FilterTermInput {
  kind: DbFilterTermKind;
  value: string;
}

export interface FilterTermView {
  id: string;
  kind: DbFilterTermKind;
  value: string;
}

export interface FilterView {
  id: string;
  name: string;
  terms: FilterTermView[];
  scopes: DbFilterScope[];
  action: DbFilterAction;
  /** `null` means the filter never expires. */
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FilterListPage {
  filters: FilterView[];
  nextCursor: string;
  hasMore: boolean;
}

/**
 * `Post.filtered_by` (spec §198.3, §199.3) — set only for a `collapse`/`warn` match. A `hide`
 * match is never represented here; the row it would attach to is omitted from the response
 * entirely (see `feeds/feed.service.ts`).
 */
export interface FilteredByHintView {
  provenance: 'FILTER' | 'FILTER_LIST';
  /** The filter's `name`, or the filter list's `display_name`. */
  name: string;
  /** Set only when `provenance === 'FILTER_LIST'` — the list's publisher (spec §199.3's
   * "filtered: spam-2026 (via @alice)"). */
  listOwner: ActorSummary | null;
  /** Never `'HIDE'` — see the class doc. */
  action: DbFilterAction;
}

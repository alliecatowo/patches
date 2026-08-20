import { FILTERED_BY_PROVENANCE } from '../api/wire/enums.js';
import type { FilteredByHint } from '../api/wire/types.js';

import { present } from '../api/present.js';
import { sanitizeForTerminal } from './sanitize.js';

/**
 * "filtered: <name>" provenance line for a collapsed/warned post (spec §198.3, §199.3 —
 * "a viewer must always be able to answer 'why did this disappear, and who decided
 * that?'"). `Post.filtered_by` arrives as `null` when unset over `@grpc/proto-loader`
 * (see `present()`), never as `undefined` — check both the same way every other
 * optional message field on the wire is checked.
 *
 * A filter-list match adds "(via @owner)" — the list's publisher, so the viewer can
 * tell their own filter from someone else's subscription without opening the filter
 * list screen. A bare filter never carries a `list_owner` and never gets the suffix.
 *
 * Returns `undefined` for `FILTER_ACTION_HIDE` — a hidden post is never returned to
 * the client at all, so there is nothing here to describe — and for an absent/
 * unspecified hint.
 */
export function describeFilteredBy(hint: FilteredByHint | null | undefined): string | undefined {
  if (!present(hint)) return undefined;
  if (hint.provenance === FILTERED_BY_PROVENANCE.UNSPECIFIED) return undefined;

  const name = sanitizeForTerminal(hint.name);
  if (name === '') return undefined;

  if (hint.provenance === FILTERED_BY_PROVENANCE.FILTER_LIST && present(hint.listOwner)) {
    const handle = sanitizeForTerminal(hint.listOwner.handle);
    if (handle !== '') return `filtered: ${name} (via @${handle})`;
  }

  return `filtered: ${name}`;
}

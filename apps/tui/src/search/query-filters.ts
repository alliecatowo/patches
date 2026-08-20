import { timestampToDate } from '@patches/proto';
import type { Post } from '../api/wire/types.js';

import { extractTags } from '../format/markup.js';

/**
 * `since:`/`from:`/`#tag` tokens parsed out of a single search query field (P12-115,
 * design vision §5.9). Filters only — never a sort/order control (spec §194).
 */
export interface ParsedSearchQuery {
  /** The remaining free-text query, with every recognised token removed and
   * whitespace collapsed — what actually goes to `SearchPostsRequest.query`. */
  readonly text: string;
  /** Parsed from `since:YYYY-MM-DD`; `undefined` when absent or unparsable. */
  readonly since: Date | undefined;
  /** The raw `YYYY-MM-DD` string, kept for display even if `since` failed to parse. */
  readonly sinceRaw: string | undefined;
  /** Parsed from `from:@handle` or `from:handle`, lowercased. Maps to
   * `SearchPostsRequest.authorHandle` — the one token the server already supports. */
  readonly fromHandle: string | undefined;
  /** Parsed from the first `#tag` token, lowercased and without the `#`. */
  readonly tag: string | undefined;
}

const SINCE_PATTERN = /\bsince:(\d{4}-\d{2}-\d{2})\b/iu;
const FROM_PATTERN = /\bfrom:@?([\w.-]+)\b/iu;
// Same grammar `format/markup.ts`'s `TAG_PATTERN` uses (never all-digits — checked below).
const TAG_TOKEN_PATTERN = /#([a-zA-Z0-9_]{1,64})\b/u;

/** True midnight UTC on `raw`, or `undefined` when `raw` isn't a real calendar date
 * (`2026-02-30` round-trips to March and must be rejected, not silently shifted). */
function parseCalendarDateUtc(raw: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(raw);
  if (match === null) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  const roundTrips =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return roundTrips ? date : undefined;
}

/** Parses `since:`/`from:`/`#tag` out of a raw query string, leaving free text behind. */
export function parseSearchQuery(raw: string): ParsedSearchQuery {
  let text = raw;

  const sinceMatch = SINCE_PATTERN.exec(raw);
  const sinceRaw = sinceMatch?.[1];
  const since = sinceRaw === undefined ? undefined : parseCalendarDateUtc(sinceRaw);
  if (sinceMatch !== null) text = text.replace(sinceMatch[0], ' ');

  const fromMatch = FROM_PATTERN.exec(raw);
  const fromHandle = fromMatch?.[1]?.toLowerCase();
  if (fromMatch !== null) text = text.replace(fromMatch[0], ' ');

  const tagMatch = TAG_TOKEN_PATTERN.exec(raw);
  const allDigits = tagMatch !== null && /^\d+$/u.test(tagMatch[1] ?? '');
  const tag = allDigits ? undefined : tagMatch?.[1]?.toLowerCase();
  if (tagMatch !== null && !allDigits) text = text.replace(tagMatch[0], ' ');

  return { text: text.replace(/\s+/gu, ' ').trim(), since, sinceRaw, fromHandle, tag };
}

/** True when `parsed` carries a filter the server has no field for — the caller must
 * both apply it client-side and disclose that ("filtered locally"). */
export function hasLocalOnlyFilter(parsed: ParsedSearchQuery): boolean {
  return parsed.since !== undefined || parsed.tag !== undefined;
}

/** Applies the filters `SearchPostsRequest` cannot express: `since:` and `#tag`.
 * `from:` is never applied here — it already reached the server as `authorHandle`. */
export function filterPostsLocally(posts: readonly Post[], parsed: ParsedSearchQuery): Post[] {
  return posts.filter((post) => {
    if (parsed.since !== undefined) {
      const createdAt = timestampToDate(post.createdAt);
      if (createdAt === undefined || createdAt < parsed.since) return false;
    }
    if (parsed.tag !== undefined && !extractTags(post.body).includes(parsed.tag)) return false;
    return true;
  });
}

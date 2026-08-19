/**
 * Parses the subtractive filter tokens the search box accepts alongside free text:
 * `from:handle` (maps to `SearchPostsRequest.authorHandle`, spec-supported server-side)
 * and `since:YYYY-MM-DD` (client-side cutoff — `SearchPostsRequest` has no date field,
 * so this trims already-fetched, already-chronological pages rather than adding a
 * server-side sort/rank, which Amendment B §194 forbids). `#tag` is left in the free
 * text verbatim — `websearch_to_tsquery` already matches it as a token.
 */
export interface ParsedSearchQuery {
  /** Free text with `from:`/`since:` tokens stripped, passed to `SearchPostsRequest.query`. */
  text: string;
  /** Empty string means "no author filter" (matches the RPC's own convention). */
  authorHandle: string;
  /** `undefined` means no `since:` token was present or it didn't parse as a date. */
  sinceMs: number | undefined;
}

const FROM_TOKEN = /(?:^|\s)from:(\S+)/iu;
const SINCE_TOKEN = /(?:^|\s)since:(\S+)/iu;

export function parseSearchQuery(raw: string): ParsedSearchQuery {
  let text = raw;
  let authorHandle = '';
  let sinceMs: number | undefined;

  const fromMatch = FROM_TOKEN.exec(text);
  if (fromMatch?.[1]) {
    authorHandle = fromMatch[1].replace(/^@/u, '');
    text = text.replace(fromMatch[0], ' ');
  }

  const sinceMatch = SINCE_TOKEN.exec(text);
  if (sinceMatch?.[1]) {
    const parsed = Date.parse(sinceMatch[1]);
    if (!Number.isNaN(parsed)) sinceMs = parsed;
    text = text.replace(sinceMatch[0], ' ');
  }

  return { text: text.replace(/\s+/gu, ' ').trim(), authorHandle, sinceMs };
}

import { MAX_TAG_NAME_CHARS, MAX_TAGS_PER_POST } from '@patches/domain';

import { AppError } from '../../common/errors/app-error.js';

/**
 * Tag extraction and normalization (`INITIAL_VISION.md` §181, §192) — pure, synchronous, and
 * deliberately free of any database or Nest dependency so `PostService` (P11-006) can call
 * {@link parseTags} directly from its own input-validation path, before a post is ever
 * written.
 *
 * A hashtag token is `#` followed by one or more Unicode letters/digits/underscore/combining
 * marks (`\p{L}\p{N}_\p{M}`), immediately preceded by start-of-string or a non-tag character
 * — so `foo#bar` inside a URL/code fragment is not extracted, the common hashtag-extraction
 * convention. Combining marks (`\p{M}`) are deliberately part of the *capture* class but never
 * part of a *valid* name (see `isValidTagName`): the whole body is NFKC-normalized before
 * matching, which composes ordinary accented text — `e` (U+0065) + a combining acute accent
 * (U+0301) — into the single precomposed letter `é` (U+00E9), so normal text never has a bare
 * combining mark left by the time this regex runs. A combining-mark *pileup* (zalgo text)
 * mostly has no precomposed form and survives normalization as bare `\p{M}` code points —
 * capturing them as part of the same candidate (rather than letting the match stop at the
 * first one and silently keep just the base letter) is what lets `isValidTagName` reject the
 * whole token outright instead of quietly truncating it into a shorter "valid" one (§192).
 * Control characters, bidirectional overrides, and zero-width characters are still none of
 * `\p{L}`/`\p{N}`/`_`/`\p{M}`, so they still simply end a candidate — no separate blocklist is
 * needed for those.
 */
const TAG_TOKEN_PATTERN = /(?<=^|[^\p{L}\p{N}_\p{M}])#([\p{L}\p{N}_\p{M}]+)/gu;

const HAS_LETTER_PATTERN = /\p{L}/u;
const HAS_COMBINING_MARK_PATTERN = /\p{M}/u;
/** Security-sensitive characters which must invalidate the whole adjacent hashtag instead of
 * merely terminating it and accidentally extracting a safe-looking prefix (§192). `Cf`
 * covers bidi controls and zero-width format characters; `Cc` covers C0/C1 controls. */
const UNSAFE_TAG_CHARACTER_PATTERN = /[\p{Cc}\p{Cf}]/u;

function isUnsafeAdjacentCharacter(character: string): boolean {
  // Ordinary text separators delimit a tag; they are not part of its hostile name. Other
  // controls/formats (NUL, bidi overrides, zero-width characters, etc.) invalidate it.
  if (character === '\n' || character === '\r' || character === '\t') return false;
  return UNSAFE_TAG_CHARACTER_PATTERN.test(character);
}

export interface TagCandidate {
  /** NFKC-normalized, casefolded — the canonical form two differently-cased/composed
   * spellings collapse to ("normalization is the identity", §181). Stored as `tags.name`. */
  name: string;
  /** As the author actually typed it (after whole-body NFKC composition — see the class doc)
   * — becomes `tags.display_name` the first time this name is used. */
  displayName: string;
}

/** True if `name` (already NFKC-normalized) satisfies §181/§188's grammar: 1-30 characters,
 * letters/digits/underscore only — no bare combining mark, which is exactly what a
 * combining-mark pileup leaves behind post-normalization (§192) — and at least one letter, so
 * an all-digit token (`#2026`) is a year, not a tag. */
function isValidTagName(name: string): boolean {
  return (
    [...name].length >= 1 &&
    [...name].length <= MAX_TAG_NAME_CHARS &&
    HAS_LETTER_PATTERN.test(name) &&
    !HAS_COMBINING_MARK_PATTERN.test(name)
  );
}

/** NFKC + Unicode-compatible lowercase identity used by both extraction and search. JS does
 * not expose the Unicode CaseFolding.txt operation directly; lowercasing after NFKC is the
 * locale-independent operation available at runtime and, unlike locale-sensitive casing,
 * is stable across nodes. */
export function normalizeTagIdentity(value: string): string {
  return value.normalize('NFKC').toLowerCase();
}

/**
 * Every valid, deduplicated tag candidate in `body`, in first-appearance order. Invalid
 * tokens (too long, all-digit, no letter, containing a bare combining mark) are silently
 * skipped — they are simply not tags, not a validation failure. Exported for
 * `TagExtractionService.extractAndAttach`, which needs the original casing too;
 * {@link parseTags} below is the narrower public surface `PostService` calls.
 */
export function extractTagCandidates(body: string): TagCandidate[] {
  // Normalize the *whole body* once, up front — matching must see already-composed text (see
  // the class doc): normalizing only the captured token after the fact is too late, because a
  // decomposed accent has already been split off into a separate `\p{M}` character the regex
  // treated as outside the letter it belongs to.
  const normalizedBody = body.normalize('NFKC');
  const seen = new Map<string, TagCandidate>();
  for (const match of normalizedBody.matchAll(TAG_TOKEN_PATTERN)) {
    const raw = match[1];
    if (raw === undefined) continue;
    const matchEnd = (match.index ?? 0) + match[0].length;
    const nextCharacter = normalizedBody.slice(matchEnd)[Symbol.iterator]().next().value;
    // `#safe<ZWJ>suffix` is one hostile name, not a valid `#safe` followed by unrelated
    // prose. Reject the entire candidate instead of silently attaching the prefix.
    if (nextCharacter !== undefined && isUnsafeAdjacentCharacter(nextCharacter)) continue;

    const name = normalizeTagIdentity(raw);
    if (!isValidTagName(name)) continue;
    if (!seen.has(name)) seen.set(name, { name, displayName: raw });
  }
  return [...seen.values()];
}

/**
 * The validator `PostService` (P11-006) calls directly from `CreatePost`/`EditPost`'s own
 * input validation, before the post is written — this is the "an eleventh tag is
 * `INVALID_ARGUMENT`, not a silent truncation" behavior (§181), which has to run pre-write,
 * not post-write. Returns the canonical (post-normalization) tag names, deduplicated, in
 * first-appearance order.
 *
 * `TagExtractionService.extractAndAttach` (the write-time relation-table half) also calls
 * this before its non-critical persistence catch so this same author-facing error is never
 * swallowed (§181).
 */
export function parseTags(body: string): string[] {
  const candidates = extractTagCandidates(body);
  if (candidates.length > MAX_TAGS_PER_POST) {
    throw AppError.validation(`A post may have at most ${String(MAX_TAGS_PER_POST)} tags.`);
  }
  return candidates.map((candidate) => candidate.name);
}

import {
  Actor,
  Filter,
  type FilterList,
  FilterListEntry,
  FilterListException,
  FilterListSubscription,
  FilterScope as FilterScopeEntity,
  FilterTerm,
  type FilterAction as DbFilterAction,
  type FilterScopeValue as DbFilterScope,
  type FilterTermKind as DbFilterTermKind,
  type Media,
  Post,
  PostMedia,
} from '@patches/database';
import { getDomain } from 'tldts';
import { In, type DataSource } from 'typeorm';

import { toActorSummary, type ActorSummary } from '../auth/auth.dto.js';
import { normalizeHandle } from '../auth/validation.js';
import { normalizeTagIdentity } from '../tags/tag-grammar.js';

/**
 * Server-side evaluation of bring-your-own filters and subscribed filter lists (spec §198,
 * §199) — the chokepoint every timeline RPC funnels through via `feeds/feed.service.ts`.
 *
 * Implementation note (spec §198.4's "implementation constraints, recorded because they are
 * load-bearing"): the spec directs `actor`/`tag`/`domain` term matching toward SQL joins on
 * indexed columns, reserving only `substring`/`word` for application-service evaluation over a
 * bounded over-fetch. This module evaluates all five kinds in the application service, uniformly,
 * inside that same bounded-over-fetch loop (`feeds/feed.service.ts`'s `page()`/`listHomeFeed`,
 * `posts/post.service.ts#searchPosts`) — still a **bounded** number of re-fetch rounds with the
 * cursor advanced to the last row examined (never unbounded looping), which is the actual
 * correctness requirement (§198.3's "a page may contain fewer items than requested" contract).
 *
 * **P14-021 SQL pushdown.** `hide`-action `ACTOR` and `TAG` rules are *additionally* pushed into
 * the feed/search query itself as `NOT IN`/`NOT EXISTS` predicates ({@link hideActorIds},
 * {@link hideTagNames}) so pages under heavy hide-filtering rarely need more than one round.
 * This is a pure performance optimization layered on top of the still-authoritative in-process
 * check above, not a replacement for it: the SQL predicate only ever needs to be a *subset* of
 * what `evaluateCandidate` would hide (it may under-match — e.g. it does not cover an `ACTOR`
 * rule matching a reposter or quoted author, or a home-feed occurrence's own repost-actor column
 * — the in-process loop still catches those), because over-matching in SQL would be a real
 * correctness bug (silently hiding a post nothing actually filters) with no downstream check to
 * catch it. `DOMAIN` `hide` pushdown is deliberately not attempted: a domain match can come from
 * a body-embedded URL with no indexed column to join against, and an imprecise SQL substring/
 * regex predicate risks exactly that over-matching failure mode — it stays in-process only.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EffectiveFilterProvenance = 'FILTER' | 'FILTER_LIST';

export interface EffectiveFilterRule {
  kind: DbFilterTermKind;
  /** For `ACTOR`, a resolved actor id (never a raw handle). For every other kind, the raw
   * literal a filter/list author supplied — normalized at match time, not here, so
   * export/import round-trips the value the user actually typed. */
  value: string;
  action: DbFilterAction;
  provenance: EffectiveFilterProvenance;
  /** The owning filter's `name`, or the filter list's `display_name`. */
  name: string;
  /** Set only when `provenance === 'FILTER_LIST'`. */
  listOwner: ActorSummary | null;
}

export interface FilterMatchCandidate {
  id: string;
  authorActorId: string;
  quotedAuthorActorId: string | null;
  /** Only populated by `FeedService.listHomeFeed`, which already collapses reposters per post
   * — every other caller passes an empty array (spec §198.2's "author, reposter, or quoted
   * author"). */
  reposterActorIds: readonly string[];
  body: string | null;
  contentWarning: string | null;
  altTexts: readonly string[];
  linkUrl: string | null;
  /** Already §181-normalized tag names. */
  tagNames: readonly string[];
}

export interface FilterMatch {
  action: DbFilterAction;
  name: string;
  provenance: EffectiveFilterProvenance;
  listOwner: ActorSummary | null;
}

const ACTION_RANK: Readonly<Record<DbFilterAction, number>> = Object.freeze({
  WARN: 1,
  COLLAPSE: 2,
  HIDE: 3,
});

/**
 * Loads the viewer's effective, scope-filtered rule set: their own active (non-expired)
 * filters that declare `scope`, plus every entry of every filter list they subscribe to whose
 * own `scopes` include `scope` (minus their own per-entry exceptions), applied with the
 * subscription's chosen action.
 *
 * P14-022: `FilterListSubscription.scopes` (`filter_list_subscriptions.scopes`, spec §199.1's
 * "an action and scopes the subscriber chooses") is the subscription-side half of the
 * intersection this function performs — a subscription only contributes rules for the scopes
 * its own subscriber chose, exactly like a personal filter's `filter_scopes`. A subscription
 * predating P14-022 (or one whose `scopes` was left empty at write time) defaults to every
 * scope at both the DB column and `FilterListService.subscribeFilterList` layers, so it never
 * silently narrows on upgrade.
 */
export async function loadEffectiveFilterRules(
  dataSource: DataSource,
  viewerActorId: string,
  scope: DbFilterScope,
): Promise<EffectiveFilterRule[]> {
  const now = new Date();

  const ownFilters = await dataSource
    .getRepository(Filter)
    .createQueryBuilder('filter')
    .innerJoin(FilterScopeEntity, 'filterScope', 'filterScope.filterId = filter.id')
    .where('filter.actorId = :viewerActorId', { viewerActorId })
    .andWhere('filterScope.scope = :scope', { scope })
    .andWhere('(filter.expiresAt IS NULL OR filter.expiresAt > :now)', { now })
    .getMany();

  const ownFilterIds = ownFilters.map((filter) => filter.id);
  const ownTerms =
    ownFilterIds.length === 0
      ? []
      : await dataSource.getRepository(FilterTerm).find({ where: { filterId: In(ownFilterIds) } });
  const ownTermsByFilter = new Map<string, FilterTerm[]>();
  for (const term of ownTerms) {
    const list = ownTermsByFilter.get(term.filterId) ?? [];
    list.push(term);
    ownTermsByFilter.set(term.filterId, list);
  }

  const rules: EffectiveFilterRule[] = [];
  for (const filter of ownFilters) {
    for (const term of ownTermsByFilter.get(filter.id) ?? []) {
      rules.push({
        kind: term.kind,
        value: term.value,
        action: filter.action,
        provenance: 'FILTER',
        name: filter.name,
        listOwner: null,
      });
    }
  }

  // P14-022 intersection: only a subscription whose own `scopes` includes this request's
  // `scope` contributes rules — filtered in-process rather than in SQL since `scopes` is a
  // small `text[]` per subscriber, not an indexed join target.
  const subscriptions = (
    await dataSource.getRepository(FilterListSubscription).find({
      where: { actorId: viewerActorId },
      relations: { filterList: { ownerActor: true, ownerCommunity: true } },
    })
  ).filter((subscription) => subscription.scopes.includes(scope));
  if (subscriptions.length > 0) {
    const listIds = subscriptions.map((subscription) => subscription.filterListId);
    const entries = await dataSource
      .getRepository(FilterListEntry)
      .find({ where: { filterListId: In(listIds) } });
    const exceptions = await dataSource
      .getRepository(FilterListException)
      .find({ where: { actorId: viewerActorId, filterListId: In(listIds) } });
    const excepted = new Set(exceptions.map((exception) => exception.filterListEntryId));

    const entriesByList = new Map<string, FilterListEntry[]>();
    for (const entry of entries) {
      if (excepted.has(entry.id)) continue;
      const list = entriesByList.get(entry.filterListId) ?? [];
      list.push(entry);
      entriesByList.set(entry.filterListId, list);
    }

    for (const subscription of subscriptions) {
      const filterList = subscription.filterList;
      const listOwner =
        filterList.ownerActor !== null
          ? toActorSummary(filterList.ownerActor)
          : communityOwnerSummary(filterList);
      for (const entry of entriesByList.get(subscription.filterListId) ?? []) {
        rules.push({
          kind: entry.kind,
          value: entry.value,
          action: subscription.action,
          provenance: 'FILTER_LIST',
          name: filterList.displayName,
          listOwner,
        });
      }
    }
  }

  return resolveActorRules(dataSource, rules);
}

/** A community-owned list has no single publishing actor; §199.3's "always shown to
 * subscribers" is satisfied by the list's `name`/`display_name` alone in that case, so this
 * returns `null` rather than fabricating an actor. */
function communityOwnerSummary(_filterList: FilterList): ActorSummary | null {
  return null;
}

/** Batch-resolves every `ACTOR`-kind rule's raw value (an actor id or a `@handle`) to a
 * canonical actor id once per request, so `matchesCandidate` below is a plain string
 * comparison — no per-row lookup. Rules that resolve to no actor are dropped: they can never
 * match anything, and dropping them here (rather than at write time) keeps a stale actor
 * reference from silently reviving if the handle is ever reused. */
async function resolveActorRules(
  dataSource: DataSource,
  rules: readonly EffectiveFilterRule[],
): Promise<EffectiveFilterRule[]> {
  const actorRules = rules.filter((rule) => rule.kind === 'ACTOR');
  if (actorRules.length === 0) return [...rules];

  const rawValues = [...new Set(actorRules.map((rule) => rule.value))];
  const uuidValues = rawValues.filter((value) => UUID_PATTERN.test(value));
  const handleValues = rawValues.filter((value) => !UUID_PATTERN.test(value));
  const normalizedHandles = handleValues.map((value) => normalizeHandle(value.replace(/^@/, '')));

  const resolvedById =
    uuidValues.length === 0
      ? []
      : await dataSource.getRepository(Actor).find({
          where: { id: In(uuidValues) },
          select: { id: true },
        });
  const resolvedByHandle =
    normalizedHandles.length === 0
      ? []
      : await dataSource.getRepository(Actor).find({
          where: { handleNormalized: In(normalizedHandles) },
          select: { id: true, handleNormalized: true },
        });

  const idByRawValue = new Map<string, string>();
  for (const actor of resolvedById) idByRawValue.set(actor.id, actor.id);
  for (let i = 0; i < handleValues.length; i += 1) {
    const raw = handleValues[i];
    const normalized = normalizedHandles[i];
    const actor = resolvedByHandle.find((row) => row.handleNormalized === normalized);
    if (raw !== undefined && actor !== undefined) idByRawValue.set(raw, actor.id);
  }

  const resolved: EffectiveFilterRule[] = [];
  for (const rule of rules) {
    if (rule.kind !== 'ACTOR') {
      resolved.push(rule);
      continue;
    }
    const actorId = idByRawValue.get(rule.value);
    if (actorId !== undefined) resolved.push({ ...rule, value: actorId });
  }
  return resolved;
}

/**
 * Batch-loads everything `matchesCandidate` needs for a page of posts: tag names, media alt
 * text, and quoted-post author ids. `dataSource`/`posts` only — never issues a per-post query.
 */
export async function buildFilterMatchCandidates(
  dataSource: DataSource,
  posts: readonly Post[],
  reposterActorIdsByPostId?: ReadonlyMap<string, readonly string[]>,
): Promise<Map<string, FilterMatchCandidate>> {
  const ids = posts.map((post) => post.id);
  if (ids.length === 0) return new Map();

  const quotedPostIds = [
    ...new Set(posts.flatMap((post) => (post.quotedPostId === null ? [] : [post.quotedPostId]))),
  ];

  const [tagRows, mediaRows, quotedAuthorRows] = await Promise.all([
    dataSource.query<Array<{ post_id: string; name: string }>>(
      `SELECT pt.post_id, t.name
       FROM post_tags pt
       INNER JOIN tags t ON t.id = pt.tag_id
       WHERE pt.post_id = ANY($1::uuid[])`,
      [ids],
    ),
    dataSource
      .getRepository(PostMedia)
      .createQueryBuilder('postMedia')
      .innerJoinAndSelect('postMedia.media', 'media')
      .where('postMedia.postId IN (:...ids)', { ids })
      .getMany(),
    quotedPostIds.length === 0
      ? Promise.resolve([])
      : dataSource.getRepository(Post).find({
          where: { id: In(quotedPostIds) },
          select: { id: true, authorActorId: true },
        }),
  ]);

  const tagsByPost = new Map<string, string[]>();
  for (const row of tagRows) {
    const list = tagsByPost.get(row.post_id) ?? [];
    list.push(row.name);
    tagsByPost.set(row.post_id, list);
  }
  const altTextsByPost = new Map<string, string[]>();
  for (const row of mediaRows as Array<PostMedia & { media: Media }>) {
    const list = altTextsByPost.get(row.postId) ?? [];
    if (row.media.altText !== null) list.push(row.media.altText);
    altTextsByPost.set(row.postId, list);
  }
  const authorByQuotedPostId = new Map(quotedAuthorRows.map((row) => [row.id, row.authorActorId]));

  const candidates = new Map<string, FilterMatchCandidate>();
  for (const post of posts) {
    candidates.set(post.id, {
      id: post.id,
      authorActorId: post.authorActorId,
      quotedAuthorActorId:
        post.quotedPostId === null ? null : (authorByQuotedPostId.get(post.quotedPostId) ?? null),
      reposterActorIds: reposterActorIdsByPostId?.get(post.id) ?? [],
      body: post.body,
      contentWarning: post.contentWarning,
      altTexts: altTextsByPost.get(post.id) ?? [],
      linkUrl: post.linkUrl,
      tagNames: tagsByPost.get(post.id) ?? [],
    });
  }
  return candidates;
}

/** Evaluates every rule against one candidate and returns the strongest match (`hide` beats
 * `collapse` beats `warn`), or `null` if nothing matched. */
export function evaluateCandidate(
  rules: readonly EffectiveFilterRule[],
  candidate: FilterMatchCandidate,
): FilterMatch | null {
  let best: FilterMatch | null = null;
  for (const rule of rules) {
    if (!matchesRule(rule, candidate)) continue;
    if (best === null || ACTION_RANK[rule.action] > ACTION_RANK[best.action]) {
      best = {
        action: rule.action,
        name: rule.name,
        provenance: rule.provenance,
        listOwner: rule.listOwner,
      };
    }
  }
  return best;
}

/**
 * `hide`-action `ACTOR` rule values, deduped, already resolved to actor ids (spec §198.4's SQL
 * pushdown, P14-021): a viewer's whole hide-actor set as a plain `NOT IN`/`NOT EXISTS` param.
 * Pushing these into SQL is a pure performance optimization — `evaluateCandidate` above still
 * re-checks every row a query returns (including the reposter/quoted-author match kinds this
 * pushdown does not cover), so an under-inclusive SQL predicate here can never produce an
 * incorrect page, only a slower one. See `feeds/feed.service.ts`/`posts/post.service.ts` for the
 * call sites.
 */
export function hideActorIds(rules: readonly EffectiveFilterRule[]): string[] {
  return [
    ...new Set(
      rules
        .filter((rule) => rule.kind === 'ACTOR' && rule.action === 'HIDE')
        .map((rule) => rule.value),
    ),
  ];
}

/** `hide`-action `TAG` rule values, deduped and normalized — the SQL-pushdown counterpart of
 * {@link hideActorIds} for tag rules (spec §198.4, P14-021). */
export function hideTagNames(rules: readonly EffectiveFilterRule[]): string[] {
  return [
    ...new Set(
      rules
        .filter((rule) => rule.kind === 'TAG' && rule.action === 'HIDE')
        .map((rule) => normalizeTagValue(rule.value)),
    ),
  ];
}

function matchesRule(rule: EffectiveFilterRule, candidate: FilterMatchCandidate): boolean {
  switch (rule.kind) {
    case 'ACTOR':
      return (
        candidate.authorActorId === rule.value ||
        candidate.quotedAuthorActorId === rule.value ||
        candidate.reposterActorIds.includes(rule.value)
      );
    case 'TAG':
      return candidate.tagNames.includes(normalizeTagValue(rule.value));
    case 'DOMAIN':
      return candidateDomains(candidate).includes(normalizeDomainValue(rule.value));
    case 'SUBSTRING':
      return matchesSubstring(candidateText(candidate), rule.value);
    case 'WORD':
      return matchesWord(candidateText(candidate), rule.value);
  }
}

function normalizeTagValue(value: string): string {
  return normalizeTagIdentity(value.trim().replace(/^#/, ''));
}

function candidateText(candidate: FilterMatchCandidate): string {
  return [candidate.body ?? '', candidate.contentWarning ?? '', ...candidate.altTexts].join('\n');
}

/** NFKC + lowercase — the same "NFKC-folded, case-insensitive" rule §198.2 states, and the
 * same operation `tags/tag-grammar.ts#normalizeTagIdentity` already uses for the identical
 * requirement on tag names. */
function foldMatchText(value: string): string {
  return value.normalize('NFKC').toLowerCase();
}

function matchesSubstring(haystackRaw: string, needleRaw: string): boolean {
  const needle = foldMatchText(needleRaw);
  if (needle.length === 0) return false;
  return foldMatchText(haystackRaw).includes(needle);
}

/** `word` bounds a term only at edges that are themselves word characters (spec §198.2): a
 * term beginning or ending in punctuation still matches (`:(`, `#1`) rather than being
 * unmatchable, which naive `\b` wrapping would produce. */
function matchesWord(haystackRaw: string, needleRaw: string): boolean {
  const needle = foldMatchText(needleRaw);
  if (needle.length === 0) return false;
  const haystack = foldMatchText(haystackRaw);
  const needsLeftBoundary = isWordChar(needle[0]);
  const needsRightBoundary = isWordChar(needle[needle.length - 1]);

  let fromIndex = 0;
  while (fromIndex <= haystack.length) {
    const index = haystack.indexOf(needle, fromIndex);
    if (index === -1) return false;
    const leftOk = !needsLeftBoundary || index === 0 || !isWordChar(haystack[index - 1]);
    const rightIndex = index + needle.length;
    const rightOk =
      !needsRightBoundary || rightIndex >= haystack.length || !isWordChar(haystack[rightIndex]);
    if (leftOk && rightOk) return true;
    fromIndex = index + 1;
  }
  return false;
}

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[\p{L}\p{N}_]/u.test(char);
}

const URL_PATTERN = /https?:\/\/[^\s<>()[\]]+/gi;

function candidateDomains(candidate: FilterMatchCandidate): string[] {
  const urls: string[] = [];
  if (candidate.linkUrl !== null && candidate.linkUrl.length > 0) urls.push(candidate.linkUrl);
  if (candidate.body !== null) urls.push(...(candidate.body.match(URL_PATTERN) ?? []));
  const domains = urls.map(hostnameOf).filter((value): value is string => value !== null);
  return [...new Set(domains.map(registrableDomainOf))];
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** `value` is either a bare domain (`example.com`) or a full URL a user pasted — either way
 * this reduces it to a registrable domain the same way {@link candidateDomains} does, so the
 * two sides compare like for like. */
function normalizeDomainValue(value: string): string {
  const trimmed = value.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const hostname = hostnameOf(withScheme) ?? stripWww(trimmed.toLowerCase());
  return registrableDomainOf(hostname);
}

function stripWww(hostname: string): string {
  return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
}

/**
 * The registrable domain (eTLD+1) per spec §198.2's "domain subscripts" (P14-021): backed by
 * `tldts`'s bundled Public Suffix List, so a multi-label public suffix like `co.uk` correctly
 * yields `example.co.uk` for `sub.example.co.uk` rather than under-splitting to `co.uk` (the
 * documented v0 limitation this replaces). `getDomain` returns `null` for a hostname that is
 * itself entirely a public suffix (`co.uk`), an unrecognized/local host (`localhost`), or an IP
 * address — those fall back to the bare (www-stripped) hostname, which cannot spuriously match a
 * real registrable-domain rule and is never itself accepted as a rule value (see
 * {@link isRegistrableDomainValue}).
 */
function registrableDomainOf(hostname: string): string {
  return getDomain(hostname) ?? stripWww(hostname);
}

/**
 * `true` iff `rawValue` (a `DOMAIN`-kind filter/filter-list-entry value, as typed by the user —
 * see this module's export/import round-trip note) reduces to a real registrable domain rather
 * than a bare public suffix. `co.uk` MUST NOT be usable as a rule: it would match every
 * `*.co.uk` site any viewer's timeline could ever surface, which is a wildcard, not a domain.
 * Called from `filters/validation.ts#parseFilterTerms` and
 * `filter-lists/validation.ts#parseFilterListEntries` at write time — matching itself
 * (`normalizeDomainValue` below) never rejects, it only normalizes.
 */
export function isRegistrableDomainValue(rawValue: string): boolean {
  const trimmed = rawValue.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const hostname = hostnameOf(withScheme) ?? stripWww(trimmed.toLowerCase());
  return getDomain(hostname) !== null;
}

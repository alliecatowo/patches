import { Code as GrpcStatus } from '@connectrpc/connect';
import type { Actor, Post, Tag } from '../api/wire/types.js';
import { useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import { useContentSize } from '../app/layout.js';
import { present } from '../api/present.js';
import type { PatchesApi } from '../api/client.js';
import { describeGrpcError, grpcStatusCode, type FriendlyError } from '../api/errors.js';
import { Loading } from '../components/Loading.js';
import { Nameplate } from '../components/Nameplate.js';
import { PostList, type PostRowActions } from '../components/PostList.js';
import { VirtualList } from '../components/VirtualList.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import {
  filterPostsLocally,
  hasLocalOnlyFilter,
  parseSearchQuery,
  type ParsedSearchQuery,
} from '../search/query-filters.js';
import { FileRecentQueriesStore, type RecentQueriesStore } from '../search/recent-queries.js';
import { theme } from '../theme/index.js';

export interface SearchScreenProps {
  api: PatchesApi;
  isActive: boolean;
  /** Enables looking up a remote `user@domain` handle via `ResolveActor` (B-028) —
   * omitted (signed out) falls back to always treating the query as a local search,
   * since `ResolveActor` requires a session. */
  ensureAccessToken?: (() => Promise<string>) | undefined;
  /** `Enter` on a result — opens that actor's profile. */
  onOpenActor: (actor: Actor) => void;
  /** `Enter` on a result in `tags` mode — opens that tag's feed. Optional so a shell
   * that hasn't wired `tagFeed` in yet still gets a working search (the row just
   * doesn't navigate until it is — same pattern as `onOpenPrivacy` elsewhere). */
  onOpenTag?: ((tag: Tag) => void) | undefined;
  /** Row actions for the Posts tab — the same bag every timeline uses, so `Enter`,
   * `l`, `b`, `r` and `f` behave identically in search results. */
  actions?: PostRowActions;
  /** `Esc` — leaves the screen without picking anyone. */
  onCancel: () => void;
  /** Injectable so tests don't touch the real XDG data dir; defaults to the file-backed
   * store (P12-115), same convention as `compose/draft-store.ts`. */
  recentQueriesStore?: RecentQueriesStore | undefined;
}

type Status =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; actors: Actor[] }
  | { status: 'tags'; tags: Tag[] }
  | { status: 'posts'; posts: Post[]; hasMore: boolean; filter: ParsedSearchQuery }
  | { status: 'error'; error: FriendlyError };

/** A remote `user@domain` handle, `@`-prefix optional (B-028) — anything else is a
 * local handle-prefix/display-name query. */
const REMOTE_ACCT_PATTERN = /^@?[\w.-]+@[\w.-]+\.[a-z]+$/;

/** What the query is searched against. `Tab` (or `1`/`2`/`3` while the query field is
 * empty — see the input handler) switches between them. */
export type SearchMode = 'people' | 'posts' | 'tags';
const MODE_ORDER: readonly SearchMode[] = ['people', 'posts', 'tags'];
const MODE_LABEL: Readonly<Record<SearchMode, string>> = {
  people: 'people',
  posts: 'posts',
  tags: 'tags',
};

/** One line describing the parsed `since:`/`from:`/`#tag` tokens, or `undefined` when
 * the query carries none. */
function filterSummary(filter: ParsedSearchQuery): string | undefined {
  const parts: string[] = [];
  if (filter.sinceRaw !== undefined) {
    parts.push(
      filter.since === undefined
        ? `since:${filter.sinceRaw} (invalid date)`
        : `since ${filter.sinceRaw}`,
    );
  }
  if (filter.fromHandle !== undefined) parts.push(`from @${filter.fromHandle}`);
  if (filter.tag !== undefined) parts.push(`tag #${filter.tag}`);
  if (parts.length === 0) return undefined;
  return `Filters: ${parts.join(' · ')}${hasLocalOnlyFilter(filter) ? ' (filtered locally)' : ''}`;
}

/**
 * `/` or `g s` — handle-prefix + display-name search (spec §112), or a remote-actor
 * lookup by `user@domain` (spec §174/B-028) when the query matches that shape. A
 * third `tags` mode searches hashtag names (`TagService.SearchTags`). Typing edits
 * the query; `Enter` runs the search the first time, then moves selection into the
 * results and opens the selected row. `since:YYYY-MM-DD`/`from:@handle`/`#tag`
 * tokens inside the query are parsed client-side (`search/query-filters.ts`) into
 * `SearchPostsRequest` fields where the server has one (`from:`), and applied as a
 * local filter with a visible note otherwise (`since:`, `#tag`) — filters only,
 * never a sort/order control (spec §194).
 */
export function SearchScreen({
  api,
  isActive,
  ensureAccessToken,
  onOpenActor,
  onOpenTag,
  actions,
  onCancel,
  recentQueriesStore,
}: SearchScreenProps): ReactElement {
  const content = useContentSize();
  const [query, setQuery] = useState('');
  // Fast typing (and this screen's own tests) can fire several `useInput` calls before
  // React re-renders — reading the `query` state variable inside that same handler
  // burst sees a stale, pre-keystroke value (the "Ink useInput stale-closure setState"
  // trap). `queryRef` is kept in lockstep with every `setQuery` call via `updateQuery`
  // below, so decisions made mid-burst (the `1`/`2`/`3` mode-shortcut guard, `Enter`
  // reading the just-typed text) see the true current value; `query` itself stays the
  // source of truth for rendering.
  const queryRef = useRef('');
  function updateQuery(next: string): void {
    queryRef.current = next;
    setQuery(next);
  }
  const [status, setStatus] = useState<Status>({ status: 'idle' });
  const [mode, setMode] = useState<SearchMode>('people');
  // Same stale-closure hazard as `queryRef` above — two `Tab` presses fired before a
  // re-render both see the same pre-switch `mode`, so a fast double-tap only advances
  // one step instead of two. Kept in lockstep by `switchMode`.
  const modeRef = useRef<SearchMode>('people');
  // A fresh search always lands on the top result, the same way the old
  // hand-rolled `selected` reset did — `VirtualList` otherwise keeps the previous
  // selection index across an items change. Reusing its `jump` prop (rather than
  // `key`-ing a remount) keeps the same `VirtualList` instance mounted, so its
  // `useInput` subscription never has to re-register mid-keystroke.
  const [resultsNonce, setResultsNonce] = useState(0);

  const [recentQueriesStoreInstance] = useState<RecentQueriesStore>(
    () => recentQueriesStore ?? new FileRecentQueriesStore(),
  );
  const [recentQueries, setRecentQueries] = useState<readonly string[]>([]);
  // -1 means "not currently recalling history" — `Up` starts stepping through
  // `recentQueries` from the most recent; `Down` steps back out toward a blank field.
  const historyIndexRef = useRef(-1);

  useEffect(() => {
    let cancelled = false;
    void recentQueriesStoreInstance.load().then((loaded) => {
      if (!cancelled) setRecentQueries(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [recentQueriesStoreInstance]);

  function recordQuery(trimmed: string): void {
    historyIndexRef.current = -1;
    void recentQueriesStoreInstance.add(trimmed).then(setRecentQueries);
  }

  async function resolveRemoteActor(rawAcct: string): Promise<void> {
    if (ensureAccessToken === undefined) {
      setStatus({
        status: 'error',
        error: {
          title: 'Sign in to look up a remote account.',
          hint: '',
          retryable: false,
          code: GrpcStatus.Unauthenticated,
        },
      });
      return;
    }
    const acct = rawAcct.startsWith('@') ? rawAcct.slice(1) : rawAcct;
    setStatus({ status: 'loading' });
    try {
      const accessToken = await ensureAccessToken();
      const response = await api.resolveActor({ acct }, accessToken);
      setStatus({ status: 'ready', actors: present(response.actor) ? [response.actor] : [] });
      setResultsNonce((nonce) => nonce + 1);
    } catch (error) {
      if (grpcStatusCode(error) === GrpcStatus.Unimplemented) {
        setStatus({
          status: 'error',
          error: {
            title: 'This server does not connect to other servers.',
            hint: '',
            retryable: false,
            code: GrpcStatus.Unimplemented,
          },
        });
        return;
      }
      setStatus({ status: 'error', error: describeGrpcError(error, api.target) });
    }
  }

  async function runPostSearch(trimmed: string): Promise<void> {
    setStatus({ status: 'loading' });
    const filter = parseSearchQuery(trimmed);
    // `SearchPostsRequest.query` must be non-blank (server rejects empty/whitespace).
    // A query that was *only* filter tokens (`from:@alice`) still needs something to
    // send — the tag text itself is a reasonable literal fallback; otherwise fall
    // back to the untouched raw input rather than failing the request client-side.
    const serverQuery =
      filter.text !== '' ? filter.text : filter.tag !== undefined ? `#${filter.tag}` : trimmed;
    try {
      const accessToken = ensureAccessToken === undefined ? undefined : await ensureAccessToken();
      // Newest-first keyset, never relevance-by-engagement (§194).
      const response = await api.searchPosts(
        {
          query: serverQuery,
          cursor: '',
          limit: 20,
          authorHandle: filter.fromHandle ?? '',
          includeReplies: true,
        },
        accessToken,
      );
      const posts = hasLocalOnlyFilter(filter)
        ? filterPostsLocally(response.posts, filter)
        : [...response.posts];
      setStatus({
        status: 'posts',
        posts,
        // A local filter can hide the last page's posts without hiding the
        // server's own "more to fetch" signal — keeping `hasMore` from the
        // response (rather than `posts.length`) is what makes `Tab`-to-load-more
        // still reach the rest of a since:/tag-filtered result set.
        hasMore: response.page?.hasMore ?? false,
        filter,
      });
    } catch (error) {
      setStatus({ status: 'error', error: describeGrpcError(error, api.target) });
    }
  }

  async function runTagSearch(trimmed: string): Promise<void> {
    setStatus({ status: 'loading' });
    try {
      const response = await api.searchTags({ query: trimmed, cursor: '', limit: 20 });
      setStatus({ status: 'tags', tags: [...response.tags] });
      setResultsNonce((nonce) => nonce + 1);
    } catch (error) {
      setStatus({ status: 'error', error: describeGrpcError(error, api.target) });
    }
  }

  async function runSearch(): Promise<void> {
    const trimmed = queryRef.current.trim();
    if (trimmed === '') return;
    recordQuery(trimmed);
    if (modeRef.current === 'posts') {
      await runPostSearch(trimmed);
      return;
    }
    if (modeRef.current === 'tags') {
      await runTagSearch(trimmed);
      return;
    }
    if (REMOTE_ACCT_PATTERN.test(trimmed)) {
      await resolveRemoteActor(trimmed);
      return;
    }
    setStatus({ status: 'loading' });
    try {
      const response = await api.searchActors({ query: trimmed, cursor: '', limit: 20 });
      setStatus({ status: 'ready', actors: [...response.actors] });
      setResultsNonce((nonce) => nonce + 1);
    } catch (error) {
      setStatus({ status: 'error', error: describeGrpcError(error, api.target) });
    }
  }

  function switchMode(next: SearchMode): void {
    if (next === modeRef.current) return;
    modeRef.current = next;
    setMode(next);
    setStatus({ status: 'idle' });
    historyIndexRef.current = -1;
  }

  function recallHistory(direction: 1 | -1): void {
    if (recentQueries.length === 0) return;
    const next = historyIndexRef.current + direction;
    if (next < -1 || next >= recentQueries.length) return;
    historyIndexRef.current = next;
    updateQuery(next === -1 ? '' : (recentQueries[next] ?? ''));
  }

  useInput(
    (input, key) => {
      if (status.status === 'loading') return;
      if (key.escape) {
        onCancel();
        return;
      }
      if (key.tab) {
        const currentIndex = MODE_ORDER.indexOf(modeRef.current);
        switchMode(MODE_ORDER[(currentIndex + 1) % MODE_ORDER.length] ?? 'people');
        return;
      }
      // Post and tag results are normal lists (`PostList`/`VirtualList`): they own
      // j/k/Enter, so this handler steps aside except for leaving and re-editing.
      if (status.status === 'posts') {
        if (key.backspace || key.delete) {
          setStatus({ status: 'idle' });
          updateQuery(queryRef.current.slice(0, -1));
        }
        return;
      }

      const actorResults =
        modeRef.current === 'people' && status.status === 'ready' ? status.actors : [];
      const tagResults = modeRef.current === 'tags' && status.status === 'tags' ? status.tags : [];
      if (actorResults.length > 0 || tagResults.length > 0) {
        // Movement (same vocabulary as every other list — j/k, arrows, Ctrl+D/U, G)
        // and `Enter` now belong to the result `VirtualList`; typing only edits the
        // query while there are no results to move through.
        return;
      }

      // Mode shortcuts only fire on an empty, freshly-focused query field — once
      // there is any text, `1`/`2`/`3` are ordinary characters (a digit inside
      // `since:2026-...` must still type, not switch tabs).
      if (queryRef.current === '' && (input === '1' || input === '2' || input === '3')) {
        const index = Number(input) - 1;
        const next = MODE_ORDER[index];
        if (next !== undefined) switchMode(next);
        return;
      }

      if (key.return) {
        void runSearch();
        return;
      }
      if (key.upArrow) {
        recallHistory(1);
        return;
      }
      if (key.downArrow) {
        recallHistory(-1);
        return;
      }

      if (key.backspace || key.delete) {
        historyIndexRef.current = -1;
        updateQuery(queryRef.current.slice(0, -1));
        return;
      }
      if (key.ctrl || key.meta) return;
      if (input.length > 0) {
        historyIndexRef.current = -1;
        updateQuery(queryRef.current + input);
      }
    },
    { isActive },
  );

  const filterLine = status.status === 'posts' ? filterSummary(status.filter) : undefined;

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={theme.accent}>Search </Text>
        {MODE_ORDER.map((candidate) => (
          <Text key={candidate}>
            <Text color={mode === candidate ? theme.accent : theme.muted} bold={mode === candidate}>
              [{MODE_LABEL[candidate]}]
            </Text>
            <Text> </Text>
          </Text>
        ))}
        <Text color={theme.muted}>Tab or 1/2/3 switches</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={theme.muted}>query </Text>
        <Text>
          {sanitizeForTerminal(query)}
          <Text color={theme.accent}>█</Text>
        </Text>
      </Box>
      {query === '' && recentQueries.length > 0 && status.status === 'idle' ? (
        <Text color={theme.muted}>↑ recalls your last search ({recentQueries.length} saved)</Text>
      ) : null}
      {status.status === 'loading' ? <Loading label="Searching" /> : null}
      {status.status === 'error' ? <Text color={theme.error}>{status.error.title}</Text> : null}
      {status.status === 'posts' && (
        <Box marginTop={1} flexDirection="column">
          {filterLine === undefined ? null : <Text color={theme.muted}>{filterLine}</Text>}
          <PostList
            posts={status.posts}
            loading={false}
            hasMore={status.hasMore}
            emptyMessage="No posts matched."
            isActive={isActive}
            chromeRows={filterLine === undefined ? 5 : 6}
            {...actions}
          />
        </Box>
      )}
      {mode === 'people' && status.status !== 'posts' && (
        // Mounted for the whole of "people" mode, not just once results land — a
        // fresh mount's `useInput` only subscribes on a later effect tick, and this
        // screen's own tests type a query and hit Enter twice back to back with no
        // frame settle between them. Staying mounted keeps the subscription already
        // live long before the result-opening `Enter` needs it.
        <Box marginTop={1} flexDirection="column">
          <VirtualList<Actor>
            items={status.status === 'ready' ? status.actors : []}
            keyOf={(actor) => actor.id}
            measure={() => 1}
            width={Math.max(10, content.columns - 4)}
            budget={Math.max(3, content.rows - 8)}
            jump={{ edge: 'top', nonce: resultsNonce }}
            isActive={isActive}
            showPosition={false}
            empty={status.status === 'ready' ? <Text color={theme.muted}>No matches.</Text> : <></>}
            renderItem={(actor, state) => (
              <Box height={1} overflow="hidden" flexShrink={0} width={state.width}>
                <Nameplate
                  handle={actor.handle}
                  nameplate={actor.nameplate ?? undefined}
                  bold={state.selected}
                  fallbackColor={state.selected ? theme.accent : undefined}
                />
                {actor.displayName === '' ? null : (
                  <Text color={theme.muted}> · {sanitizeForTerminal(actor.displayName)}</Text>
                )}
              </Box>
            )}
            onKey={(_input, key, actor) => {
              if (key.return && actor !== undefined) {
                onOpenActor(actor);
                return true;
              }
              return false;
            }}
          />
        </Box>
      )}
      {mode === 'tags' && status.status !== 'posts' && (
        <Box marginTop={1} flexDirection="column">
          <VirtualList<Tag>
            items={status.status === 'tags' ? status.tags : []}
            keyOf={(tag) => tag.id}
            measure={() => 1}
            width={Math.max(10, content.columns - 4)}
            budget={Math.max(3, content.rows - 8)}
            jump={{ edge: 'top', nonce: resultsNonce }}
            isActive={isActive}
            showPosition={false}
            empty={status.status === 'tags' ? <Text color={theme.muted}>No matches.</Text> : <></>}
            renderItem={(tag, state) => (
              <Box height={1} overflow="hidden" flexShrink={0} width={state.width}>
                <Text bold={state.selected} {...(state.selected ? { color: theme.accent } : {})}>
                  #{sanitizeForTerminal(tag.displayName === '' ? tag.name : tag.displayName)}
                </Text>
              </Box>
            )}
            onKey={(_input, key, tag) => {
              if (key.return && tag !== undefined) {
                onOpenTag?.(tag);
                return true;
              }
              return false;
            }}
          />
        </Box>
      )}
      <Box marginTop={1}>
        <Text color={theme.muted}>
          {status.status === 'ready' || status.status === 'tags'
            ? 'j/k select · Enter open · Tab/1-3 mode · Esc cancel'
            : status.status === 'posts'
              ? 'j/k · Enter thread · Backspace edit · Tab/1-3 mode · Esc cancel'
              : 'Enter search · ↑/↓ recall · Tab/1-3 mode · Esc cancel'}
        </Text>
      </Box>
    </Box>
  );
}

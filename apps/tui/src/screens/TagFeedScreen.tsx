import type {
  ListTagFeedRequest,
  ListTagFeedResponse,
  MuteTagRequest,
  MuteTagResponse,
  SearchTagsRequest,
  SearchTagsResponse,
  Tag,
  UnmuteTagRequest,
  UnmuteTagResponse,
} from '../api/wire/types.js';
import { useCallback, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import { useContentSize } from '../app/layout.js';
import { movementTarget } from '../app/list-movement.js';
import { Loading } from '../components/Loading.js';
import { PostList, type PostRowActions } from '../components/PostList.js';
import { computeViewport, resolveTopIndex } from '../components/list-viewport.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { fitHints, truncateToWidth } from '../format/measure.js';
import { usePaginatedPosts, type PostPage } from '../hooks/usePaginatedPosts.js';
import { theme } from '../theme/index.js';

export interface TagFeedScreenApi {
  readonly target: string;
  searchTags(request: SearchTagsRequest, accessToken?: string): Promise<SearchTagsResponse>;
  listTagFeed(request: ListTagFeedRequest, accessToken?: string): Promise<ListTagFeedResponse>;
  muteTag(request: MuteTagRequest, accessToken: string): Promise<MuteTagResponse>;
  unmuteTag(request: UnmuteTagRequest, accessToken: string): Promise<UnmuteTagResponse>;
}

export interface TagFeedScreenProps {
  api: TagFeedScreenApi;
  isActive: boolean;
  ensureAccessToken?: (() => Promise<string>) | undefined;
  actions?: PostRowActions | undefined;
  initialTag?: Tag | undefined;
  initiallyMutedTagIds?: ReadonlySet<string> | undefined;
  onCancel: () => void;
}

type SearchState =
  | { status: 'idle'; tags: readonly Tag[]; cursor: string; hasMore: boolean }
  | { status: 'loading'; tags: readonly Tag[]; cursor: string; hasMore: boolean }
  | { status: 'ready'; tags: readonly Tag[]; cursor: string; hasMore: boolean }
  | { status: 'error'; tags: readonly Tag[]; cursor: string; hasMore: boolean; message: string };

function alphabetical(tags: readonly Tag[]): readonly Tag[] {
  return [...tags].sort((left, right) => left.name.localeCompare(right.name));
}

/** `t` search and `#` explicit tag timeline, kept independent of shared-shell routing. */
export function TagFeedScreen({
  api,
  isActive,
  ensureAccessToken,
  actions,
  initialTag,
  initiallyMutedTagIds = new Set(),
  onCancel,
}: TagFeedScreenProps): ReactElement {
  const content = useContentSize();
  const [mode, setMode] = useState<'search' | 'feed'>(initialTag === undefined ? 'search' : 'feed');
  const [query, setQuery] = useState('');
  const [openedTag, setOpenedTag] = useState<Tag | undefined>(initialTag);
  const [selected, setSelected] = useState(0);
  const [top, setTop] = useState(0);
  const [mutedTagIds, setMutedTagIds] = useState<ReadonlySet<string>>(initiallyMutedTagIds);
  const [search, setSearch] = useState<SearchState>({
    status: 'idle',
    tags: [],
    cursor: '',
    hasMore: false,
  });
  const [muteStatus, setMuteStatus] = useState<'idle' | 'working'>('idle');
  const [muteError, setMuteError] = useState('');

  const optionalToken = useCallback(
    (): Promise<string | undefined> =>
      ensureAccessToken === undefined ? Promise.resolve(undefined) : ensureAccessToken(),
    [ensureAccessToken],
  );
  const tagName = openedTag?.name ?? '';
  const fetchFeed = useCallback(
    async (cursor: string): Promise<PostPage> => {
      if (tagName === '') return { posts: [], page: undefined };
      const token = await optionalToken();
      const response = await api.listTagFeed({ tag: tagName, cursor, limit: 20 }, token);
      return { posts: response.posts, page: response.page };
    },
    [api, optionalToken, tagName],
  );
  const {
    posts,
    loading: feedLoading,
    loadingMore: feedLoadingMore,
    hasMore: feedHasMore,
    error: feedError,
    loadMore: loadMoreFeed,
  } = usePaginatedPosts(api.target, fetchFeed);

  const selectedIndex = Math.min(selected, Math.max(search.tags.length - 1, 0));
  const listBudget = Math.max(3, content.rows - 6);
  const heights = search.tags.map(() => 1);
  const effectiveTop = resolveTopIndex(top, selectedIndex, heights, listBudget);
  const viewport = computeViewport(effectiveTop, heights, listBudget);

  async function runSearch(loadMore = false): Promise<void> {
    const normalized = query.trim().replace(/^#/, '');
    if (normalized === '' || search.status === 'loading') return;
    const cursor = loadMore ? search.cursor : '';
    setSearch((current) => ({ ...current, status: 'loading' }));
    try {
      const token = await optionalToken();
      const response = await api.searchTags({ query: normalized, cursor, limit: 20 }, token);
      setSearch((current) => ({
        status: 'ready',
        tags: alphabetical(loadMore ? [...current.tags, ...response.tags] : response.tags),
        cursor: response.page?.nextCursor ?? '',
        hasMore: response.page?.hasMore ?? false,
      }));
      if (!loadMore) {
        setSelected(0);
        setTop(0);
      }
    } catch (error) {
      setSearch((current) => ({
        ...current,
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  async function toggleMute(): Promise<void> {
    if (openedTag === undefined || muteStatus === 'working') return;
    if (ensureAccessToken === undefined) {
      setMuteError('Sign in to mute tags.');
      return;
    }
    setMuteStatus('working');
    setMuteError('');
    const wasMuted = mutedTagIds.has(openedTag.id);
    try {
      const token = await ensureAccessToken();
      if (wasMuted) await api.unmuteTag({ tagId: openedTag.id }, token);
      else await api.muteTag({ tagId: openedTag.id }, token);
      setMutedTagIds((current) => {
        const next = new Set(current);
        if (wasMuted) next.delete(openedTag.id);
        else next.add(openedTag.id);
        return next;
      });
      // Deliberately keep `openedTag` and already-loaded posts visible. A mute is a
      // discovery filter, not a reason to blank an explicitly opened view (§181).
    } catch (error) {
      setMuteError(error instanceof Error ? error.message : String(error));
    } finally {
      setMuteStatus('idle');
    }
  }

  useInput(
    (input, key) => {
      if (key.escape) {
        if (mode === 'feed' && initialTag === undefined) {
          setMode('search');
          return;
        }
        onCancel();
        return;
      }
      if (mode === 'feed') {
        if ((input === 'n' || input === ' ') && feedHasMore) loadMoreFeed();
        if (input === 'M') void toggleMute();
        return;
      }
      if (search.status === 'loading') return;
      if (search.tags.length > 0) {
        const moved = movementTarget({
          input,
          key,
          current: selectedIndex,
          total: search.tags.length,
          pageSize: Math.max(1, viewport.end - viewport.start),
        });
        if (moved !== undefined) {
          setSelected(moved);
          setTop(effectiveTop);
          return;
        }
        if (key.return) {
          const tag = search.tags[selectedIndex];
          if (tag !== undefined) {
            setOpenedTag(tag);
            setMode('feed');
          }
          return;
        }
        if ((input === 'n' || input === ' ') && search.hasMore) {
          void runSearch(true);
          return;
        }
      } else if (key.return) {
        void runSearch();
        return;
      }
      if (key.backspace || key.delete) {
        setQuery((current) => current.slice(0, -1));
        setSearch({ status: 'idle', tags: [], cursor: '', hasMore: false });
        return;
      }
      if (key.ctrl || key.meta) return;
      if (input.length > 0) {
        setQuery((current) => current + input);
        setSearch({ status: 'idle', tags: [], cursor: '', hasMore: false });
      }
    },
    { isActive },
  );

  if (mode === 'feed' && openedTag !== undefined) {
    const muted = mutedTagIds.has(openedTag.id);
    return (
      <Box flexDirection="column">
        <Text color={theme.accent}>
          #{sanitizeForTerminal(openedTag.displayName || openedTag.name)}
        </Text>
        <Text color={muted ? theme.warn : theme.muted}>
          Chronological · {muted ? 'muted (explicit view remains open)' : 'not muted'} · M{' '}
          {muted ? 'unmute' : 'mute'}
        </Text>
        {feedError === undefined ? null : (
          <Text color={theme.error}>{sanitizeForTerminal(feedError.title)}</Text>
        )}
        {muteError === '' ? null : (
          <Text color={theme.error}>{sanitizeForTerminal(muteError)}</Text>
        )}
        <PostList
          posts={posts}
          loading={feedLoading || feedLoadingMore}
          hasMore={feedHasMore}
          emptyMessage="No public posts carry this tag."
          loadMoreKeyHint="n / space"
          isActive={isActive}
          chromeRows={5}
          {...actions}
        />
        <Text color={theme.muted}>
          {fitHints(['j/k posts', 'M mute/unmute', 'n more', 'Esc back'], content.columns)}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color={theme.accent}>Tag search</Text>
      <Text>
        <Text color={theme.muted}>tag #</Text>
        {sanitizeForTerminal(query)}
        <Text color={theme.accent}>█</Text>
      </Text>
      {search.status === 'error' ? (
        <Text color={theme.error}>{sanitizeForTerminal(search.message)}</Text>
      ) : null}
      {search.status === 'loading' && search.tags.length === 0 ? (
        <Loading label="Searching tags" />
      ) : search.tags.length === 0 ? (
        <Text color={theme.muted}>
          {search.status === 'ready' ? 'No matching tags.' : 'Type a prefix and press Enter.'}
        </Text>
      ) : (
        <Box flexDirection="column" height={listBudget} overflow="hidden">
          {search.tags.slice(viewport.start, viewport.end).map((tag, offset) => {
            const index = viewport.start + offset;
            const isSelected = index === selectedIndex;
            return (
              <Text key={tag.id} color={isSelected ? theme.accent : theme.muted} bold={isSelected}>
                {isSelected ? '› ' : '  '}#
                {truncateToWidth(
                  sanitizeForTerminal(tag.displayName || tag.name),
                  content.columns - 4,
                )}
              </Text>
            );
          })}
        </Box>
      )}
      <Text color={theme.muted}>
        {search.status === 'loading'
          ? 'Loading…'
          : fitHints(
              search.tags.length === 0
                ? ['Enter search', 'Esc back']
                : ['j/k select', 'Enter open', 'n more', 'Backspace edit', 'Esc back'],
              content.columns,
            )}
      </Text>
    </Box>
  );
}

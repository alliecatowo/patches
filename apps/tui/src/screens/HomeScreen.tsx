import { useCallback, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import type { PatchesApi } from '../api/client.js';
import { PostList, type PostRowActions } from '../components/PostList.js';
import { ViewsBar } from '../components/ViewsBar.js';
import { usePaginatedPosts, type PostPage } from '../hooks/usePaginatedPosts.js';
import { theme } from '../theme/index.js';
import type {
  SavedViewSource,
  SavedViewsKey,
  SavedViewsStore,
} from '../views/saved-views-store.js';

export interface HomeScreenProps {
  api: PatchesApi;
  /** Whether this screen currently owns keyboard input (spec §69: `g h`). */
  isActive: boolean;
  /** Resolves a fresh access token, refreshing first if needed — `App` requires a
   * session before navigating here (`ListHomeFeed` needs one). */
  ensureAccessToken: () => Promise<string>;
  actions: PostRowActions;
  /** Bumped by `App` after a successful post — re-reads this list from the server. */
  refreshKey?: number;
  /** #192: client-persisted named views (tag/community/home/local). Absent in tests
   * that don't exercise the switcher. */
  savedViews?: { store: SavedViewsStore; key: SavedViewsKey } | undefined;
}

/**
 * `g h` — the caller's home timeline: their own posts plus everyone they follow,
 * chronological, fan-out-on-read (spec §52, §137). Requires a session (`App` gates
 * navigation the same way it gates `c`/own `g p`).
 */
export function HomeScreen({
  api,
  isActive,
  ensureAccessToken,
  actions,
  refreshKey = 0,
  savedViews,
}: HomeScreenProps): ReactElement {
  const [activeViewSource, setActiveViewSource] = useState<SavedViewSource | undefined>(undefined);
  const [editingView, setEditingView] = useState(false);

  const fetchPage = useCallback(
    (cursor: string): Promise<PostPage> => {
      if (activeViewSource !== undefined && activeViewSource.kind !== 'home') {
        const response =
          activeViewSource.kind === 'local'
            ? api.listLocalFeed({ cursor, limit: 20 })
            : activeViewSource.kind === 'tag'
              ? api.listTagFeed({ tag: activeViewSource.tag, cursor, limit: 20 })
              : api.listCommunityFeed({
                  communityId: activeViewSource.communityId,
                  cursor,
                  limit: 20,
                });
        return response.then((page) => ({ posts: page.posts, page: page.page }));
      }
      return ensureAccessToken()
        .then((accessToken) => api.listHomeFeed({ cursor, limit: 20 }, accessToken))
        .then((response) => ({ posts: response.posts, page: response.page }));
    },
    // `refreshKey` is a deliberate cache-buster, not a value this callback reads:
    // changing its identity is exactly how `usePaginatedList` is told to re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
    [api, ensureAccessToken, refreshKey, activeViewSource],
  );
  // B-043: a stable cache key lets a second mount of this screen (the palette
  // overlay's frozen background snapshot, `components/Overlay.tsx`) render the
  // already-loaded page instead of flashing "Loading" behind the palette.
  const { posts, loading, loadingMore, hasMore, error, loadMore, refresh, refreshing, newCount } =
    usePaginatedPosts(
      api.target,
      fetchPage,
      `home:${api.target}:${String(refreshKey)}:${activeViewSource === undefined ? 'home' : JSON.stringify(activeViewSource)}`,
    );

  useInput(
    (input) => {
      if ((input === 'n' || input === ' ') && hasMore) {
        loadMore();
        return;
      }
      // `R` re-reads page one from the server: the `↑ N new` marker, and — the
      // reason it matters — fresh `viewer_state`, so likes made in an earlier
      // session stop looking un-liked.
      if (input === 'R') refresh();
    },
    { isActive: isActive && !loading && !editingView },
  );

  return (
    <Box flexDirection="column">
      <Text color={theme.accent}>Home</Text>
      {savedViews === undefined ? null : (
        <ViewsBar
          store={savedViews.store}
          storeKey={savedViews.key}
          isActive={isActive}
          activeSource={activeViewSource}
          onActiveSourceChange={setActiveViewSource}
          onEditingChange={setEditingView}
        />
      )}
      {error === undefined ? null : <Text color={theme.error}>{error.title}</Text>}
      <Box marginTop={1}>
        <PostList
          posts={posts}
          loading={loading || loadingMore || refreshing}
          newCount={newCount}
          hasMore={hasMore}
          emptyMessage={
            activeViewSource === undefined
              ? 'Nobody you follow has posted yet — try Local (g l) or search (/).'
              : 'No posts in this view yet.'
          }
          loadMoreKeyHint="n / space"
          isActive={isActive}
          {...actions}
        />
      </Box>
    </Box>
  );
}

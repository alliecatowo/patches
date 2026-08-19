import { present } from '../../api/present.js';
import type { Post } from '@patches/proto';
import { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import type { ReactElement } from 'react';

import type { PatchesApi } from '../../api/client.js';
import { PostRow } from '../../components/PostRow.js';
import { theme } from '../../theme/index.js';

export interface PinnedPostsSectionProps {
  api: PatchesApi;
  ownerActorId: string;
}

/**
 * The "── pinned ──" strip above a Patches Page's sub-page content (P12-109, design
 * vision §5.5) — up to `packages/domain`'s pinned-posts-per-actor limit
 * (`PostService.PinPost`), resolved from the owning actor's `pinned_post_ids`
 * (`ActorService.GetActor`) with one `GetPost` per id. A post that no longer resolves
 * — removed, or the viewer blocks/is blocked by its author, both of which `GetPost`
 * surfaces as a uniform `NOT_FOUND` (spec §62) — is silently dropped rather than shown
 * as an error: this is a page decoration, not the page's own content, so a missing
 * pin degrades to "one fewer pinned post," never a visible failure. Renders nothing
 * while loading or once resolved to zero posts, same as every other optional block.
 */
export function PinnedPostsSection({
  api,
  ownerActorId,
}: PinnedPostsSectionProps): ReactElement | null {
  const [posts, setPosts] = useState<readonly Post[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .getActor({ id: ownerActorId })
      .then(async (response) => {
        const ids = present(response.actor) ? response.actor.pinnedPostIds : [];
        if (ids.length === 0) return [];
        const settled = await Promise.allSettled(ids.map((id) => api.getPost({ id })));
        return settled.flatMap((result) =>
          result.status === 'fulfilled' && present(result.value.post) ? [result.value.post] : [],
        );
      })
      .then((resolved) => {
        if (!cancelled) setPosts(resolved);
      })
      .catch(() => {
        if (!cancelled) setPosts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [api, ownerActorId]);

  if (posts.length === 0) return null;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={theme.muted}>── pinned ──</Text>
      {posts.map((post) => (
        <PostRow key={post.id} post={post} />
      ))}
    </Box>
  );
}

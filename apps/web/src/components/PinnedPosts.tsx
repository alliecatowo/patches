import { type Actor, type Post } from '@patches/proto/es';
import { useQuery } from '@tanstack/react-query';
import { type JSX } from 'react';

import { api } from '../api/client.js';
import { PostCard } from './PostCard.js';
import styles from './PinnedPosts.module.css';

/**
 * The "── pinned ──" strip (P12-109), web parity with the TUI's
 * `apps/tui/src/pages/render/pinned.tsx`: up to three of the owner's pinned posts
 * (spec §188 — `Actor.pinned_post_ids` on the wire), resolved with one
 * `GetActor` + one `GetPost` per id. A pin that no longer resolves — removed post,
 * or a block-either-direction viewer (`GetPost` surfaces both as uniform
 * `NOT_FOUND`, spec §62) — is silently dropped rather than shown as an error:
 * this is decoration, not the page's own content, so a missing pin degrades to
 * "one fewer pinned post," never a visible failure. Renders nothing while loading,
 * on error, or once resolved to zero posts, like every other optional section.
 */
export function PinnedPosts({ ownerActorId }: { ownerActorId: string }): JSX.Element | null {
  const pinnedQuery = useQuery({
    queryKey: ['pinned-posts', ownerActorId],
    queryFn: async (): Promise<Post[]> => {
      const actorResponse = await api.actors.getActor({ id: ownerActorId });
      const actor: Actor | undefined = actorResponse.actor;
      const ids = (actor?.pinnedPostIds ?? []).slice(0, 3);
      if (ids.length === 0) return [];
      const settled = await Promise.allSettled(ids.map((id) => api.posts.getPost({ id })));
      return settled.flatMap((result) =>
        result.status === 'fulfilled' && result.value.post ? [result.value.post] : [],
      );
    },
    staleTime: 60_000,
  });

  const posts = pinnedQuery.data;
  if (posts === undefined || posts.length === 0) return null;

  return (
    <section className={styles['pinned']} aria-label="Pinned posts">
      <h2 className={styles['heading']}>pinned</h2>
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </section>
  );
}

import { CommunityRole, type Community } from '@patches/proto/es';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JSX } from 'react';
import { useParams } from 'react-router-dom';

import { api } from '../api/client.js';
import { PostTimeline } from '../components/PostTimeline.js';
import { useErrorToast } from '../hooks/useErrorToast.js';
import { useSession } from '../hooks/useSession.js';

/**
 * `/c/:id` — there's no `GetCommunityByName` RPC yet (`CommunityService` only
 * has `GetCommunity(id)`), so this route's `:id` param is the community's
 * `Community.id`, not its display name. Follow-up: add a name-based lookup
 * RPC, or resolve name→id client-side via `ListCommunities` once that
 * service exposes a name filter.
 */
export function CommunityRoute(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const communityId = id ?? '';
  const session = useSession();
  const onError = useErrorToast();
  const queryClient = useQueryClient();

  const communityQuery = useQuery({
    queryKey: ['community', communityId],
    queryFn: () => api.community.getCommunity({ id: communityId }),
    enabled: communityId !== '',
  });

  const membershipMutation = useMutation({
    mutationFn: async (join: boolean): Promise<{ community?: Community | undefined }> =>
      join
        ? await api.community.joinCommunity({ communityId })
        : await api.community.leaveCommunity({ communityId }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['community', communityId] }),
    onError,
  });

  if (communityQuery.isPending) return <p style={{ padding: '1rem' }}>Loading…</p>;
  const community = communityQuery.data?.community;
  if (!community) return <p style={{ padding: '1rem' }}>Community not found.</p>;

  const isMember = community.viewerRole !== CommunityRole.UNSPECIFIED;

  return (
    <div>
      <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)' }}>
        <h1>{community.displayName || community.name}</h1>
        <p>{community.description}</p>
        <p style={{ color: 'var(--fg-muted)' }}>
          {community.counts?.members ?? 0} members · {community.counts?.posts ?? 0} posts
        </p>
        {session ? (
          <button
            type="button"
            onClick={() => membershipMutation.mutate(!isMember)}
            disabled={membershipMutation.isPending}
          >
            {isMember ? 'Leave' : 'Join'}
          </button>
        ) : null}
      </div>
      <PostTimeline
        queryKey={['feed', 'community', communityId]}
        fetchPage={(cursor) => api.feed.listCommunityFeed({ communityId, cursor, limit: 30 })}
        emptyMessage="No posts in this community yet."
      />
    </div>
  );
}

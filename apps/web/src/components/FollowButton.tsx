import { FollowState, type Relationship } from '@patches/proto/es';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { JSX } from 'react';

import { api } from '../api/client.js';
import { useAbortableMutation } from '../hooks/useAbortableMutation.js';
import { useErrorToast } from '../hooks/useErrorToast.js';
import { useSession } from '../hooks/useSession.js';

export function FollowButton({ actorId }: { actorId: string }): JSX.Element | null {
  const session = useSession();
  const onError = useErrorToast();
  const queryClient = useQueryClient();
  const isSelf = session?.actor.id === actorId;

  const relationshipQuery = useQuery({
    queryKey: ['relationship', actorId],
    queryFn: () => api.socialGraph.getRelationship({ actorId }),
    enabled: session !== null && !isSelf,
  });

  // B-164: navigating away from this profile mid-toggle must not later write a stale
  // relationship into the cache or toast a failure for a button that's no longer on screen.
  const mutation = useAbortableMutation({
    mutationFn: async (
      follow: boolean,
      signal,
    ): Promise<{ relationship?: Relationship | undefined }> =>
      follow
        ? await api.socialGraph.followActor({ actorId }, { signal })
        : await api.socialGraph.unfollowActor({ actorId }, { signal }),
    onSuccess: (response) => {
      queryClient.setQueryData(['relationship', actorId], { relationship: response.relationship });
    },
    onError,
  });

  if (session === null || isSelf) return null;
  if (relationshipQuery.isPending) return <button type="button" disabled aria-label="Loading follow status" aria-busy="true">…</button>;

  const state = relationshipQuery.data?.relationship?.state ?? FollowState.NONE;
  const following = state === FollowState.FOLLOWING;
  const pending = state === FollowState.PENDING;

  const label = pending
    ? 'Cancel follow request'
    : following
      ? 'Unfollow'
      : 'Follow';

  return (
    <button
      type="button"
      onClick={() => mutation.mutate(!following)}
      disabled={mutation.isPending}
      aria-label={label}
    >
      {pending ? 'Requested' : following ? 'Following' : 'Follow'}
    </button>
  );
}

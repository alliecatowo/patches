import {
  COMMUNITY_INVITE_STATUS,
  COMMUNITY_ROLE,
  type BanFromCommunityRequest,
  type BanFromCommunityResponse,
  type Community,
  type CommunityInvite,
  type CommunityMember,
  type JoinCommunityRequest,
  type JoinCommunityResponse,
  type LeaveCommunityRequest,
  type LeaveCommunityResponse,
  type ListCommunitiesRequest,
  type ListCommunitiesResponse,
  type ListCommunityFeedRequest,
  type ListCommunityFeedResponse,
  type ListCommunityMembersRequest,
  type ListCommunityMembersResponse,
  type RespondToCommunityInviteRequest,
  type RespondToCommunityInviteResponse,
  type SetCommunityRoleRequest,
  type SetCommunityRoleResponse,
} from '@patches/proto';
import { useCallback, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import { present } from '../api/present.js';
import { useContentSize } from '../app/layout.js';
import { movementTarget } from '../app/list-movement.js';
import { Loading } from '../components/Loading.js';
import { PostList, type PostRowActions } from '../components/PostList.js';
import { computeViewport, resolveTopIndex } from '../components/list-viewport.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { fitHints, truncateToWidth } from '../format/measure.js';
import {
  usePaginatedList,
  usePaginatedPosts,
  type Page,
  type PostPage,
} from '../hooks/usePaginatedPosts.js';
import { theme } from '../theme/index.js';

export interface CommunitiesScreenApi {
  readonly target: string;
  listCommunities(
    request: ListCommunitiesRequest,
    accessToken?: string,
  ): Promise<ListCommunitiesResponse>;
  listCommunityFeed(
    request: ListCommunityFeedRequest,
    accessToken?: string,
  ): Promise<ListCommunityFeedResponse>;
  listCommunityMembers(
    request: ListCommunityMembersRequest,
    accessToken?: string,
  ): Promise<ListCommunityMembersResponse>;
  joinCommunity(request: JoinCommunityRequest, accessToken: string): Promise<JoinCommunityResponse>;
  leaveCommunity(
    request: LeaveCommunityRequest,
    accessToken: string,
  ): Promise<LeaveCommunityResponse>;
  setCommunityRole(
    request: SetCommunityRoleRequest,
    accessToken: string,
  ): Promise<SetCommunityRoleResponse>;
  banFromCommunity(
    request: BanFromCommunityRequest,
    accessToken: string,
  ): Promise<BanFromCommunityResponse>;
  respondToCommunityInvite(
    request: RespondToCommunityInviteRequest,
    accessToken: string,
  ): Promise<RespondToCommunityInviteResponse>;
}

export interface CommunitiesScreenProps {
  api: CommunitiesScreenApi;
  isActive: boolean;
  ensureAccessToken?: (() => Promise<string>) | undefined;
  actions?: PostRowActions | undefined;
  invites?: readonly CommunityInvite[] | undefined;
  onCompose: (community: Community) => void;
  onInvite: (community: Community) => void;
  onEditAbout: (community: Community) => void;
  onRemovePost: (community: Community) => void;
  onCancel: () => void;
}

type View = 'list' | 'timeline' | 'members' | 'about' | 'rules' | 'invites';

function communityTitle(community: Community): string {
  return community.displayName === '' ? `+${community.name}` : community.displayName;
}

function roleLabel(role: CommunityMember['role']): string {
  return role === COMMUNITY_ROLE.MODERATOR ? 'moderator' : 'member';
}

/**
 * `g c`'s self-contained community browser. The shared shell only has to provide
 * navigation callbacks and a narrow API implementation later; all list/timeline/
 * members/about/rules/invite state lives here in the meantime.
 */
export function CommunitiesScreen({
  api,
  isActive,
  ensureAccessToken,
  actions,
  invites = [],
  onCompose,
  onInvite,
  onEditAbout,
  onRemovePost,
  onCancel,
}: CommunitiesScreenProps): ReactElement {
  const content = useContentSize();
  const [view, setView] = useState<View>('list');
  const [selectedCommunity, setSelectedCommunity] = useState(0);
  const [openedCommunityId, setOpenedCommunityId] = useState('');
  const [selectedMember, setSelectedMember] = useState(0);
  const [selectedInvite, setSelectedInvite] = useState(0);
  const [listTop, setListTop] = useState(0);
  const [memberTop, setMemberTop] = useState(0);
  const [roleOverrides, setRoleOverrides] = useState<ReadonlyMap<string, Community>>(new Map());
  const [actionError, setActionError] = useState('');
  const [acting, setActing] = useState(false);

  const accessToken = useCallback(
    (): Promise<string | undefined> =>
      ensureAccessToken === undefined ? Promise.resolve(undefined) : ensureAccessToken(),
    [ensureAccessToken],
  );
  const fetchCommunities = useCallback(
    async (cursor: string): Promise<Page<Community>> => {
      const token = await accessToken();
      const response = await api.listCommunities({ cursor, limit: 20 }, token);
      return { items: response.communities, page: response.page };
    },
    [accessToken, api],
  );
  const {
    items: listedCommunities,
    loading: communitiesLoading,
    loadingMore: communitiesLoadingMore,
    hasMore: communitiesHaveMore,
    error: communitiesError,
    loadMore: loadMoreCommunities,
  } = usePaginatedList<Community>(api.target, fetchCommunities);

  const communities = listedCommunities.map(
    (community) => roleOverrides.get(community.id) ?? community,
  );
  const communityIndex = Math.min(selectedCommunity, Math.max(communities.length - 1, 0));
  const listedCommunity = communities[communityIndex];
  const community =
    openedCommunityId === ''
      ? listedCommunity
      : (communities.find((item) => item.id === openedCommunityId) ?? listedCommunity);
  const communityId = openedCommunityId;

  const fetchPosts = useCallback(
    async (cursor: string): Promise<PostPage> => {
      if (communityId === '') return { posts: [], page: undefined };
      const token = await accessToken();
      const response = await api.listCommunityFeed({ communityId, cursor, limit: 20 }, token);
      return { posts: response.posts, page: response.page };
    },
    [accessToken, api, communityId],
  );
  const {
    posts,
    loading: postsLoading,
    loadingMore: postsLoadingMore,
    hasMore: postsHaveMore,
    error: postsError,
    loadMore: loadMorePosts,
  } = usePaginatedPosts(api.target, fetchPosts);

  const fetchMembers = useCallback(
    async (cursor: string): Promise<Page<CommunityMember>> => {
      if (communityId === '') return { items: [], page: undefined };
      const token = await accessToken();
      const response = await api.listCommunityMembers({ communityId, cursor, limit: 20 }, token);
      return { items: response.members, page: response.page };
    },
    [accessToken, api, communityId],
  );
  const {
    items: members,
    loading: membersLoading,
    loadingMore: membersLoadingMore,
    hasMore: membersHaveMore,
    error: membersError,
    loadMore: loadMoreMembers,
  } = usePaginatedList<CommunityMember>(api.target, fetchMembers);

  const listBudget = Math.max(3, content.rows - 5);
  const communityHeights = communities.map(() => 2);
  const effectiveListTop = resolveTopIndex(listTop, communityIndex, communityHeights, listBudget);
  const communityViewport = computeViewport(effectiveListTop, communityHeights, listBudget);

  const memberIndex = Math.min(selectedMember, Math.max(members.length - 1, 0));
  const memberBudget = Math.max(3, content.rows - 6);
  const memberHeights = members.map(() => 1);
  const effectiveMemberTop = resolveTopIndex(memberTop, memberIndex, memberHeights, memberBudget);
  const memberViewport = computeViewport(effectiveMemberTop, memberHeights, memberBudget);
  const inviteIndex = Math.min(selectedInvite, Math.max(invites.length - 1, 0));
  const isModerator = community?.viewerRole === COMMUNITY_ROLE.MODERATOR;
  const isMember = community !== undefined && community.viewerRole !== COMMUNITY_ROLE.UNSPECIFIED;

  async function requireToken(): Promise<string | undefined> {
    if (ensureAccessToken === undefined) {
      setActionError('Sign in to join or manage a community.');
      return undefined;
    }
    return ensureAccessToken();
  }

  async function toggleMembership(): Promise<void> {
    if (community === undefined || acting) return;
    const token = await requireToken();
    if (token === undefined) return;
    setActing(true);
    setActionError('');
    try {
      const response = isMember
        ? await api.leaveCommunity({ communityId: community.id }, token)
        : await api.joinCommunity({ communityId: community.id }, token);
      if (present(response.community)) {
        const updatedCommunity = response.community;
        setRoleOverrides((current) => new Map(current).set(community.id, updatedCommunity));
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setActing(false);
    }
  }

  async function toggleSelectedMemberRole(): Promise<void> {
    const member = members[memberIndex];
    if (!isModerator || community === undefined || !present(member?.actor) || acting) return;
    const token = await requireToken();
    if (token === undefined) return;
    const role =
      member.role === COMMUNITY_ROLE.MODERATOR ? COMMUNITY_ROLE.MEMBER : COMMUNITY_ROLE.MODERATOR;
    setActing(true);
    setActionError('');
    try {
      await api.setCommunityRole(
        { communityId: community.id, actorId: member.actor.id, role },
        token,
      );
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setActing(false);
    }
  }

  async function banSelectedMember(): Promise<void> {
    const member = members[memberIndex];
    if (!isModerator || community === undefined || !present(member?.actor) || acting) return;
    const token = await requireToken();
    if (token === undefined) return;
    setActing(true);
    setActionError('');
    try {
      await api.banFromCommunity(
        { communityId: community.id, actorId: member.actor.id, reason: '' },
        token,
      );
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setActing(false);
    }
  }

  async function respondToInvite(accept: boolean): Promise<void> {
    const invite = invites[inviteIndex];
    if (invite === undefined || invite.status !== COMMUNITY_INVITE_STATUS.PENDING || acting) return;
    const token = await requireToken();
    if (token === undefined) return;
    setActing(true);
    setActionError('');
    try {
      await api.respondToCommunityInvite({ inviteId: invite.id, accept }, token);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setActing(false);
    }
  }

  function back(): void {
    if (view === 'list') onCancel();
    else if (view === 'timeline' || view === 'invites') {
      setView('list');
      setOpenedCommunityId('');
    } else setView('timeline');
  }

  useInput(
    (input, key) => {
      if (key.escape) {
        back();
        return;
      }
      if (acting) return;

      if (view === 'list') {
        if ((input === 'n' || input === ' ') && communitiesHaveMore) {
          loadMoreCommunities();
          return;
        }
        if (input === 'i') {
          setView('invites');
          return;
        }
        const moved = movementTarget({
          input,
          key,
          current: communityIndex,
          total: communities.length,
          pageSize: Math.max(1, communityViewport.end - communityViewport.start),
        });
        if (moved !== undefined) {
          setSelectedCommunity(moved);
          setListTop(effectiveListTop);
          return;
        }
        if (key.return && community !== undefined) {
          setOpenedCommunityId(community.id);
          setView('timeline');
        }
        return;
      }

      if (view === 'invites') {
        const moved = movementTarget({
          input,
          key,
          current: inviteIndex,
          total: invites.length,
          pageSize: Math.max(1, Math.min(invites.length, content.rows - 5)),
        });
        if (moved !== undefined) {
          setSelectedInvite(moved);
          return;
        }
        if (input === 'A') void respondToInvite(true);
        if (input === 'D') void respondToInvite(false);
        return;
      }

      if (community === undefined) return;
      if (input === 'J') {
        void toggleMembership();
        return;
      }
      if (view === 'timeline') {
        if ((input === 'n' || input === ' ') && postsHaveMore) loadMorePosts();
        else if (input === 'c' && isMember) onCompose(community);
        else if (input === 'm') setView('members');
        else if (input === 'a') setView('about');
        else if (input === 'U') setView('rules');
        else if (input === 'i') setView('invites');
        else if (input === 'I' && isMember) onInvite(community);
        else if (input === 'X' && isModerator) onRemovePost(community);
        return;
      }
      if (view === 'members') {
        if ((input === 'n' || input === ' ') && membersHaveMore) {
          loadMoreMembers();
          return;
        }
        const moved = movementTarget({
          input,
          key,
          current: memberIndex,
          total: members.length,
          pageSize: Math.max(1, memberViewport.end - memberViewport.start),
        });
        if (moved !== undefined) {
          setSelectedMember(moved);
          setMemberTop(effectiveMemberTop);
          return;
        }
        if (input === 'P') void toggleSelectedMemberRole();
        if (input === 'B') void banSelectedMember();
        if (input === 'I' && isMember) onInvite(community);
        return;
      }
      if (view === 'about' && input === 'E' && isModerator) onEditAbout(community);
    },
    { isActive },
  );

  const sanitizedError = sanitizeForTerminal(actionError);
  if (view === 'list') {
    const visible = communities.slice(communityViewport.start, communityViewport.end);
    return (
      <Box flexDirection="column">
        <Text color={theme.accent}>Communities</Text>
        {communitiesError === undefined ? null : (
          <Text color={theme.error}>{sanitizeForTerminal(communitiesError.title)}</Text>
        )}
        {communities.length === 0 ? (
          communitiesLoading ? (
            <Loading label="Loading communities" />
          ) : (
            <Text color={theme.muted}>No communities yet.</Text>
          )
        ) : (
          <Box flexDirection="column" height={listBudget} overflow="hidden">
            {visible.map((item, offset) => {
              const index = communityViewport.start + offset;
              const selected = isActive && index === communityIndex;
              return (
                <Box key={item.id} flexDirection="column" height={2}>
                  <Text color={selected ? theme.accent : theme.muted} bold={selected}>
                    {selected ? '› ' : '  '}+{sanitizeForTerminal(item.name)} ·{' '}
                    {truncateToWidth(
                      sanitizeForTerminal(communityTitle(item)),
                      content.columns - 15,
                    )}
                  </Text>
                  <Text color={theme.muted}>
                    {'  '}
                    {item.viewerRole === COMMUNITY_ROLE.UNSPECIFIED
                      ? 'public · read-only until joined'
                      : roleLabel(item.viewerRole)}
                  </Text>
                </Box>
              );
            })}
          </Box>
        )}
        <Text color={theme.muted}>
          {communitiesLoadingMore
            ? 'Loading more…'
            : fitHints(
                ['j/k select', 'Enter open', 'i invites', 'n more', 'Esc back'],
                content.columns,
              )}
        </Text>
      </Box>
    );
  }

  if (view === 'invites') {
    return (
      <Box flexDirection="column">
        <Text color={theme.accent}>Community invites</Text>
        {invites.length === 0 ? (
          <Text color={theme.muted}>No pending invites.</Text>
        ) : (
          invites.map((invite, index) => (
            <Text
              key={invite.id}
              color={index === inviteIndex ? theme.accent : theme.muted}
              bold={index === inviteIndex}
            >
              {index === inviteIndex ? '› ' : '  '}
              {present(invite.inviter)
                ? `@${sanitizeForTerminal(invite.inviter.handle)}`
                : 'Someone'}{' '}
              invited you · {sanitizeForTerminal(invite.communityId)}
            </Text>
          ))
        )}
        {sanitizedError === '' ? null : <Text color={theme.error}>{sanitizedError}</Text>}
        <Text color={theme.muted}>A accept · D decline · j/k select · Esc back</Text>
      </Box>
    );
  }

  if (community === undefined) return <Text color={theme.error}>Community unavailable.</Text>;
  const title = sanitizeForTerminal(communityTitle(community));
  const membership = isMember ? roleLabel(community.viewerRole) : 'read-only public view';

  if (view === 'members') {
    return (
      <Box flexDirection="column">
        <Text color={theme.accent}>{title} · members</Text>
        {membersError === undefined ? null : (
          <Text color={theme.error}>{sanitizeForTerminal(membersError.title)}</Text>
        )}
        {members.length === 0 ? (
          membersLoading ? (
            <Loading label="Loading members" />
          ) : (
            <Text color={theme.muted}>No members.</Text>
          )
        ) : (
          <Box flexDirection="column" height={memberBudget} overflow="hidden">
            {members.slice(memberViewport.start, memberViewport.end).map((member, offset) => {
              const index = memberViewport.start + offset;
              const selected = index === memberIndex;
              return (
                <Text
                  key={member.actor?.id ?? String(index)}
                  color={selected ? theme.accent : theme.muted}
                >
                  {selected ? '› ' : '  '}@
                  {present(member.actor) ? sanitizeForTerminal(member.actor.handle) : 'unknown'} ·{' '}
                  {roleLabel(member.role)}
                </Text>
              );
            })}
          </Box>
        )}
        {membersLoadingMore ? <Loading label="Loading more" /> : null}
        {sanitizedError === '' ? null : <Text color={theme.error}>{sanitizedError}</Text>}
        <Text color={theme.muted}>
          {isModerator
            ? 'j/k select · P promote/demote · B ban · I invite · Esc back'
            : 'j/k select · I invite · Esc back'}
        </Text>
      </Box>
    );
  }

  if (view === 'about' || view === 'rules') {
    return (
      <Box flexDirection="column">
        <Text color={theme.accent}>{title}</Text>
        <Text color={theme.muted}>
          +{sanitizeForTerminal(community.name)} · {membership}
        </Text>
        <Box marginTop={1} flexDirection="column">
          <Text bold>{view === 'rules' ? 'Rules' : 'About'}</Text>
          <Text wrap="wrap">
            {sanitizeForTerminal(view === 'rules' ? community.rules : community.description) ||
              'None.'}
          </Text>
        </Box>
        {sanitizedError === '' ? null : <Text color={theme.error}>{sanitizedError}</Text>}
        <Text color={theme.muted}>
          {view === 'about' && isModerator
            ? 'E edit · J leave · Esc back'
            : 'J join/leave · Esc back'}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color={theme.accent}>{title}</Text>
      <Text color={isMember ? theme.muted : theme.warn}>
        {isMember
          ? `Chronological · ${membership} · J leave`
          : 'Chronological · Read-only public community · J join to post'}
      </Text>
      {postsError === undefined ? null : (
        <Text color={theme.error}>{sanitizeForTerminal(postsError.title)}</Text>
      )}
      {sanitizedError === '' ? null : <Text color={theme.error}>{sanitizedError}</Text>}
      <PostList
        posts={posts}
        loading={postsLoading || postsLoadingMore}
        hasMore={postsHaveMore}
        emptyMessage="No posts in this community yet."
        loadMoreKeyHint="n / space"
        isActive={isActive}
        chromeRows={5}
        {...actions}
      />
      <Text color={theme.muted}>
        {fitHints(
          [
            ...(isMember ? ['c compose', 'I invite'] : ['J join']),
            'm members',
            'a about',
            'U rules',
            ...(isModerator ? ['X moderate post'] : []),
            'Esc back',
          ],
          content.columns,
        )}
      </Text>
    </Box>
  );
}

import { useQuery } from '@tanstack/react-query';

import { api } from '../api/client.js';
import { WEB_DM_POLL_MS } from '../lib/poll-intervals.js';

/**
 * The conversation list query, shared by every pane that needs the list beside it in the
 * two-pane chat shell (`MessagesRoute`, `MessageThreadRoute`, `NewMessageRoute`) — same
 * `queryKey` as before (`['conversations']`) so TanStack Query dedupes the network call across
 * whichever of those is mounted.
 */
export function useConversationsQuery(): ReturnType<
  typeof useQuery<Awaited<ReturnType<typeof api.messages.listConversations>>>
> {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.messages.listConversations({ cursor: '', limit: 30 }),
    // ADR 0032 §1: the DM list updates within 60s while the tab is focused; single source of
    // truth in `lib/poll-intervals.ts` (P19-021). `refetchIntervalInBackground` stays at its
    // TanStack Query default (`false`), which already suspends this interval while the tab is
    // hidden/unfocused — see `docs/research/tanstack-query.md`.
    refetchInterval: WEB_DM_POLL_MS,
    // Re-enabled for this query only; the app-wide default in `main.tsx` stays off. A DM inbox
    // that silently misses new messages while backgrounded is exactly the gap ADR 0032 closes.
    refetchOnWindowFocus: true,
  });
}

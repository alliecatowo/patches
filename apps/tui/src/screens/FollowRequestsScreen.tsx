import { toDate } from '../api/wire/time.js';
import type { FollowRequest } from '../api/wire/types.js';
import { useCallback, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import type { PatchesApi } from '../api/client.js';
import { present } from '../api/present.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { formatRelativeTime } from '../format/relative-time.js';
import { Loading } from '../components/Loading.js';
import { Nameplate } from '../components/Nameplate.js';
import { usePaginatedList, type Page } from '../hooks/usePaginatedPosts.js';
import { theme } from '../theme/index.js';

export interface FollowRequestsScreenProps {
  api: PatchesApi;
  isActive: boolean;
  ensureAccessToken: () => Promise<string>;
  /** `Esc` — back to whichever screen `:followrequests` was opened from. */
  onBack: () => void;
}

/**
 * `:followrequests` — pending requests to follow the caller's own locked account
 * (spec §197.5). `A` accepts (creates the follow), `D` rejects (discards it) —
 * neither ever creates a `follows` row until accepted.
 */
export function FollowRequestsScreen({
  api,
  isActive,
  ensureAccessToken,
  onBack,
}: FollowRequestsScreenProps): ReactElement {
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [resolvedIds, setResolvedIds] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState('');

  const fetchPage = useCallback(
    async (cursor: string): Promise<Page<FollowRequest>> => {
      const accessToken = await ensureAccessToken();
      const response = await api.listFollowRequests({ cursor, limit: 30 }, accessToken);
      return { items: response.requests, page: response.page };
    },
    [api, ensureAccessToken],
  );
  const {
    items,
    loading,
    loadingMore,
    hasMore,
    error: loadError,
    loadMore,
  } = usePaginatedList<FollowRequest>(api.target, fetchPage);

  const requests = items.filter(
    (request) => present(request.actor) && !resolvedIds.has(request.actor.id),
  );
  const index = Math.min(selected, Math.max(requests.length - 1, 0));

  async function respond(accept: boolean): Promise<void> {
    const request = requests[index];
    if (request === undefined || !present(request.actor) || busy) return;
    setBusy(true);
    setError('');
    try {
      const accessToken = await ensureAccessToken();
      if (accept) await api.acceptFollowRequest({ actorId: request.actor.id }, accessToken);
      else await api.rejectFollowRequest({ actorId: request.actor.id }, accessToken);
      setResolvedIds((current) => new Set(current).add(request.actor?.id ?? ''));
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : String(thrown));
    } finally {
      setBusy(false);
    }
  }

  useInput(
    (input, key) => {
      if (key.escape) {
        onBack();
        return;
      }
      if (busy) return;
      if (requests.length === 0) return;
      if (input === 'j' || key.downArrow) {
        setSelected(Math.min(requests.length - 1, index + 1));
        return;
      }
      if (input === 'k' || key.upArrow) {
        setSelected(Math.max(0, index - 1));
        return;
      }
      if (input === 'A') {
        void respond(true);
        return;
      }
      if (input === 'D') {
        void respond(false);
        return;
      }
      if (hasMore && (input === 'm' || key.pageDown)) loadMore();
    },
    { isActive },
  );

  return (
    <Box flexDirection="column">
      <Text color={theme.accent}>Follow requests</Text>
      {loadError === undefined ? null : (
        <Text color={theme.error}>{sanitizeForTerminal(loadError.title)}</Text>
      )}
      <Box flexDirection="column" marginTop={1}>
        {requests.length === 0 ? (
          loading ? (
            <Loading label="Loading" />
          ) : (
            <Text color={theme.muted}>No pending follow requests.</Text>
          )
        ) : (
          requests.map((request, rowIndex) => {
            const createdAt = toDate(request.createdAt);
            const when = present(createdAt) ? formatRelativeTime(createdAt) : '';
            return (
              <Box key={request.actor?.id ?? String(rowIndex)}>
                <Text color={isActive && rowIndex === index ? theme.accent : theme.muted}>
                  {rowIndex === index ? '› ' : '  '}
                </Text>
                {present(request.actor) ? (
                  <Nameplate
                    handle={request.actor.handle}
                    nameplate={request.actor.nameplate ?? undefined}
                  />
                ) : (
                  <Text color={theme.muted}>unknown</Text>
                )}
                {when === '' ? null : <Text color={theme.muted}> · {when}</Text>}
              </Box>
            );
          })
        )}
      </Box>
      {loadingMore ? <Loading label="Loading more" /> : null}
      {error === '' ? null : <Text color={theme.error}>{sanitizeForTerminal(error)}</Text>}
      <Text color={theme.muted}>
        j/k select · A accept · D decline{hasMore ? ' · m more' : ''} · Esc back
      </Text>
    </Box>
  );
}

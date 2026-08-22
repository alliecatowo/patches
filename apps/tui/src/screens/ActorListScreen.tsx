import type { Actor } from '../api/wire/types.js';
import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import type { PatchesApi } from '../api/client.js';
import { present } from '../api/present.js';
import { Loading } from '../components/Loading.js';
import { Nameplate } from '../components/Nameplate.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { usePaginatedList, type Page } from '../hooks/usePaginatedPosts.js';
import { theme } from '../theme/index.js';

export interface ActorListScreenProps {
  api: PatchesApi;
  title: string;
  fetchPage: (cursor: string) => Promise<Page<Actor>>;
  isActive: boolean;
  onBack: () => void;
  onOpenProfile: (actor: Actor) => void;
}

export function ActorListScreen({
  api,
  title,
  fetchPage,
  isActive,
  onBack,
  onOpenProfile,
}: ActorListScreenProps): ReactElement {
  const [selected, setSelected] = useState(0);

  const {
    items: actors,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
  } = usePaginatedList<Actor>(api.target, fetchPage);

  const index = Math.min(selected, Math.max(actors.length - 1, 0));

  useInput(
    (input, key) => {
      if (key.escape) {
        onBack();
        return;
      }
      if (actors.length === 0) return;
      if (input === 'j' || key.downArrow) {
        setSelected(Math.min(actors.length - 1, index + 1));
        return;
      }
      if (input === 'k' || key.upArrow) {
        setSelected(Math.max(0, index - 1));
        return;
      }
      if (key.return || input === 'o') {
        const actor = actors[index];
        if (present(actor)) {
          onOpenProfile(actor);
        }
        return;
      }
      if (hasMore && (input === 'm' || key.pageDown)) {
        loadMore();
      }
    },
    { isActive },
  );

  return (
    <Box flexDirection="column">
      <Text color={theme.accent} bold>
        {title}
      </Text>
      {error === undefined ? null : (
        <Text color={theme.error}>{sanitizeForTerminal(error.title)}</Text>
      )}
      <Box flexDirection="column" marginTop={1}>
        {actors.length === 0 ? (
          loading ? (
            <Loading label="Loading" />
          ) : (
            <Text color={theme.muted}>No people found.</Text>
          )
        ) : (
          actors.map((actor, rowIndex) => (
            <Box key={actor.id} flexDirection="column">
              <Box>
                <Text color={isActive && rowIndex === index ? theme.accent : theme.muted}>
                  {rowIndex === index ? '› ' : '  '}
                </Text>
                <Nameplate handle={actor.handle} nameplate={actor.nameplate ?? undefined} />
                {actor.displayName ? (
                  <Text color={theme.muted}> ({sanitizeForTerminal(actor.displayName)})</Text>
                ) : null}
              </Box>
              {actor.bio ? (
                <Box paddingLeft={4}>
                  <Text color={theme.muted} wrap="truncate-end">
                    {sanitizeForTerminal(actor.bio)}
                  </Text>
                </Box>
              ) : null}
            </Box>
          ))
        )}
      </Box>
      {loadingMore ? <Loading label="Loading more" /> : null}
      <Text color={theme.muted}>
        j/k select · Enter open profile{hasMore ? ' · m more' : ''} · Esc back
      </Text>
    </Box>
  );
}

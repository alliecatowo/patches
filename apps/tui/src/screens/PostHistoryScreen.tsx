import { present } from '../api/present.js';
import { timestampToDate } from '@patches/proto';
import type { PostEdit } from '../api/wire/types.js';
import { Box, Text, useInput } from 'ink';
import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';

import { useContentSize } from '../app/layout.js';
import { movementTarget } from '../app/list-movement.js';
import type { PatchesApi } from '../api/client.js';
import { describeGrpcError, type FriendlyError } from '../api/errors.js';
import { Loading } from '../components/Loading.js';
import { formatRelativeTime } from '../format/relative-time.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { theme } from '../theme/index.js';

export interface PostHistoryScreenProps {
  api: PatchesApi;
  postId: string;
  isActive: boolean;
  ensureAccessToken?: (() => Promise<string>) | undefined;
}

interface HistoryState {
  edits: readonly PostEdit[];
  cursor: string;
  hasMore: boolean;
  loading: boolean;
  error?: FriendlyError;
}

const INITIAL_STATE: HistoryState = { edits: [], cursor: '', hasMore: false, loading: true };

/** Immutable prior versions of a post. This is intentionally a separate route—not
 * an expanding row—so opening history never changes a timeline row's measured
 * height or selection (spec §186/P12-104). */
export function PostHistoryScreen({
  api,
  postId,
  isActive,
  ensureAccessToken,
}: PostHistoryScreenProps): ReactElement {
  const content = useContentSize();
  const [state, setState] = useState<HistoryState>(INITIAL_STATE);
  const [selected, setSelected] = useState(0);

  const loadPage = useCallback(
    async (cursor: string, append: boolean): Promise<void> => {
      setState((current) => ({
        edits: current.edits,
        cursor: current.cursor,
        hasMore: current.hasMore,
        loading: true,
      }));
      try {
        const token = await ensureAccessToken?.();
        const response = await api.listPostEdits({ postId, cursor, limit: 20 }, token);
        setState((current) => ({
          edits: append ? [...current.edits, ...response.edits] : response.edits,
          cursor: response.page?.nextCursor ?? '',
          hasMore: response.page?.hasMore ?? false,
          loading: false,
        }));
      } catch (error) {
        setState((current) => ({
          ...current,
          loading: false,
          error: describeGrpcError(error, api.target),
        }));
      }
    },
    [api, ensureAccessToken, postId],
  );

  useEffect(() => {
    void loadPage('', false);
  }, [loadPage]);

  const maxIndex = Math.max(0, state.edits.length - 1);
  const effectiveSelected = Math.min(selected, maxIndex);
  const visibleCount = Math.max(1, Math.floor((content.rows - 4) / 3));
  const start = Math.min(
    Math.max(0, effectiveSelected - Math.floor(visibleCount / 2)),
    Math.max(0, state.edits.length - visibleCount),
  );
  const end = Math.min(state.edits.length, start + visibleCount);

  useInput(
    (input, key) => {
      if ((input === 'n' || input === ' ') && state.hasMore && !state.loading) {
        void loadPage(state.cursor, true);
        return;
      }
      if (input === 'R' && !state.loading) {
        setSelected(0);
        void loadPage('', false);
        return;
      }
      const moved = movementTarget({
        input,
        key,
        current: effectiveSelected,
        total: state.edits.length,
        pageSize: visibleCount,
      });
      if (moved !== undefined) setSelected(moved);
    },
    { isActive },
  );

  return (
    <Box flexDirection="column" height={content.rows} overflow="hidden">
      <Text color={theme.accent}>Edit history</Text>
      {state.error === undefined ? null : <Text color={theme.error}>{state.error.title}</Text>}
      {state.edits.length === 0 ? (
        state.loading ? (
          <Loading label="Loading edit history" />
        ) : (
          <Text color={theme.muted}>This post has not been edited.</Text>
        )
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {state.edits.slice(start, end).map((edit, offset) => (
            <HistoryRow
              key={edit.id}
              edit={edit}
              selected={isActive && start + offset === effectiveSelected}
            />
          ))}
        </Box>
      )}
      <Text color={theme.muted} wrap="truncate-end">
        {state.loading
          ? 'Loading…'
          : state.edits.length === 0
            ? 'Esc back'
            : `${String(effectiveSelected + 1)}/${String(state.edits.length)}${state.hasMore ? ' · n / space more' : ' · oldest loaded'} · Esc back`}
      </Text>
    </Box>
  );
}

function HistoryRow({ edit, selected }: { edit: PostEdit; selected: boolean }): ReactElement {
  const createdAt = timestampToDate(edit.createdAt);
  const when = present(createdAt) ? formatRelativeTime(createdAt) : '';
  const body = edit.previousBody === '' ? '[media-only post]' : edit.previousBody;
  return (
    <Box flexDirection="column" height={3} flexShrink={0} overflow="hidden">
      <Text color={selected ? theme.accent : theme.muted} bold={selected} wrap="truncate-end">
        {selected ? '› ' : '  '}revision {when === '' ? '' : `· ${when}`}
      </Text>
      <Text wrap="truncate-end">{sanitizeForTerminal(body)}</Text>
      <Text color={theme.muted} wrap="truncate-end">
        {edit.previousContentWarning === ''
          ? `${String(edit.previousMedia.length)} attachment(s)`
          : `CW: ${sanitizeForTerminal(edit.previousContentWarning)} · ${String(edit.previousMedia.length)} attachment(s)`}
      </Text>
    </Box>
  );
}

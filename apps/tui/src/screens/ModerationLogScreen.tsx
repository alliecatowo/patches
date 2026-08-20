import {
  MODERATION_ACTION_TYPE,
  MODERATION_LOG_SUBJECT_KIND,
  MODERATION_REASON_CATEGORY,
} from '../api/wire/enums.js';
import { toDate } from '../api/wire/time.js';
import type { ModerationLogEntry } from '../api/wire/types.js';
import { useCallback, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import { present } from '../api/present.js';
import type { PatchesApi } from '../api/client.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { formatRelativeTime } from '../format/relative-time.js';
import { Loading } from '../components/Loading.js';
import { usePaginatedList, type Page } from '../hooks/usePaginatedPosts.js';
import { theme } from '../theme/index.js';

export interface ModerationLogScreenProps {
  api: PatchesApi;
  isActive: boolean;
  /** `Esc` — back to whichever screen `:modlog` was opened from. */
  onBack: () => void;
}

// protobuf-es enums are numeric with an automatic reverse mapping (ADR 0023): indexing
// the enum object by value is already the prefix-stripped member name.
function actionLabel(action: MODERATION_ACTION_TYPE): string {
  return MODERATION_ACTION_TYPE[action].toLowerCase();
}
function reasonLabel(category: MODERATION_REASON_CATEGORY): string {
  return MODERATION_REASON_CATEGORY[category].toLowerCase();
}

function subjectLabel(entry: ModerationLogEntry): string {
  if (entry.subjectKind === MODERATION_LOG_SUBJECT_KIND.DOMAIN) {
    return sanitizeForTerminal(entry.subjectDomain);
  }
  return MODERATION_LOG_SUBJECT_KIND[entry.subjectKind].toLowerCase();
}

/**
 * `:modlog` — this node's public, anonymized moderation log (spec §201.4). A
 * transparency instrument about the node's own conduct, not a record of any
 * individual's — account/post/media entries never carry a handle, actor id, or
 * post id; only domain entries are fully identified. Unauthenticated, keyset-paged.
 */
export function ModerationLogScreen({
  api,
  isActive,
  onBack,
}: ModerationLogScreenProps): ReactElement {
  const [selected, setSelected] = useState(0);

  const fetchPage = useCallback(
    async (cursor: string): Promise<Page<ModerationLogEntry>> => {
      const response = await api.listModerationLog({ cursor, limit: 30 });
      return { items: response.entries, page: response.page };
    },
    [api],
  );
  const { items, loading, loadingMore, hasMore, error, loadMore } =
    usePaginatedList<ModerationLogEntry>(api.target, fetchPage);

  const index = Math.min(selected, Math.max(items.length - 1, 0));

  useInput(
    (input, key) => {
      if (key.escape) {
        onBack();
        return;
      }
      if (items.length === 0) return;
      if (input === 'j' || key.downArrow) {
        setSelected(Math.min(items.length - 1, index + 1));
        return;
      }
      if (input === 'k' || key.upArrow) {
        setSelected(Math.max(0, index - 1));
        return;
      }
      if (hasMore && (input === 'm' || input === ' ' || key.pageDown)) loadMore();
    },
    { isActive },
  );

  return (
    <Box flexDirection="column">
      <Text color={theme.accent}>Moderation log</Text>
      <Text color={theme.muted}>
        Public and anonymized — this node's own conduct, not anyone else's.
      </Text>
      {error === undefined ? null : (
        <Text color={theme.error}>{sanitizeForTerminal(error.title)}</Text>
      )}
      <Box flexDirection="column" marginTop={1}>
        {items.length === 0 ? (
          loading ? (
            <Loading label="Loading" />
          ) : (
            <Text color={theme.muted}>No entries yet.</Text>
          )
        ) : (
          items.map((entry, rowIndex) => {
            const createdAt = toDate(entry.createdAt);
            const when = present(createdAt) ? formatRelativeTime(createdAt) : '';
            return (
              <Text
                key={entry.id}
                color={isActive && rowIndex === index ? theme.accent : theme.muted}
                bold={isActive && rowIndex === index}
                wrap="truncate-end"
              >
                {rowIndex === index ? '› ' : '  '}
                {actionLabel(entry.action)} · {subjectLabel(entry)} ·{' '}
                {reasonLabel(entry.reasonCategory)}
                {entry.appealed ? ' · appealed' : ''}
                {when === '' ? '' : ` · ${when}`}
              </Text>
            );
          })
        )}
      </Box>
      {loadingMore ? <Loading label="Loading more" /> : null}
      <Text color={theme.muted}>j/k select{hasMore ? ' · m/space more' : ''} · Esc back</Text>
    </Box>
  );
}

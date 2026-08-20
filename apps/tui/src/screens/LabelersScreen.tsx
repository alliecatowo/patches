import { LABEL_ACTION } from '../api/wire/enums.js';
import type { LabelAction, Labeler } from '../api/wire/types.js';
import { useCallback, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import type { PatchesApi } from '../api/client.js';
import { present } from '../api/present.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { Loading } from '../components/Loading.js';
import { usePaginatedList, type Page } from '../hooks/usePaginatedPosts.js';
import { theme } from '../theme/index.js';

export interface LabelersScreenProps {
  api: PatchesApi;
  isActive: boolean;
  ensureAccessToken: () => Promise<string>;
  /** `Esc` — back to whichever screen `:labelers` was opened from. */
  onBack: () => void;
}

const ACTION_CYCLE: readonly LabelAction[] = [
  LABEL_ACTION.WARN,
  LABEL_ACTION.COLLAPSE,
  LABEL_ACTION.HIDE,
  LABEL_ACTION.IGNORE,
];

function ownerLabel(labeler: Labeler): string {
  if (labeler.isNodeLabeler) return 'this node';
  if (present(labeler.actor)) return `@${sanitizeForTerminal(labeler.actor.handle)}`;
  if (present(labeler.community)) return `+${sanitizeForTerminal(labeler.community.name)}`;
  return 'unknown';
}

// protobuf-es enums are numeric with an automatic reverse mapping (ADR 0023): indexing
// the enum object by value is already the prefix-stripped member name.
function actionLabel(action: LabelAction): string {
  return LABEL_ACTION[action].toLowerCase();
}

/**
 * `:labelers` — subscriber-scoped label annotation (spec §200). A label is only
 * ever visible to actors who opted in by subscribing here; subscribing has no
 * effect on anyone else, and never contributes to a score for anyone.
 */
export function LabelersScreen({
  api,
  isActive,
  ensureAccessToken,
  onBack,
}: LabelersScreenProps): ReactElement {
  const [selected, setSelected] = useState(0);
  const [valueIndex, setValueIndex] = useState(0);
  const [subscribedIds, setSubscribedIds] = useState<ReadonlySet<string>>(new Set());
  const [unsubscribedIds, setUnsubscribedIds] = useState<ReadonlySet<string>>(new Set());
  const [overrides, setOverrides] = useState<ReadonlyMap<string, LabelAction>>(new Map());
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const fetchPage = useCallback(
    async (cursor: string): Promise<Page<Labeler>> => {
      const accessToken = await ensureAccessToken().catch(() => undefined);
      const response = await api.listLabelers({ cursor, limit: 30 }, accessToken);
      return { items: response.labelers, page: response.page };
    },
    [api, ensureAccessToken],
  );
  const { items, loading, loadingMore, hasMore, error, loadMore } = usePaginatedList<Labeler>(
    api.target,
    fetchPage,
  );

  const index = Math.min(selected, Math.max(items.length - 1, 0));
  const labeler = items[index];
  const vocabIndex =
    labeler === undefined ? 0 : Math.min(valueIndex, Math.max(labeler.vocabulary.length - 1, 0));

  async function toggleSubscribe(): Promise<void> {
    if (labeler === undefined || busy) return;
    setBusy(true);
    try {
      const accessToken = await ensureAccessToken();
      if (subscribedIds.has(labeler.id) && !unsubscribedIds.has(labeler.id)) {
        await api.unsubscribeLabeler({ labelerId: labeler.id }, accessToken);
        setUnsubscribedIds((current) => new Set(current).add(labeler.id));
        setSubscribedIds((current) => {
          const next = new Set(current);
          next.delete(labeler.id);
          return next;
        });
        setNotice(`Unsubscribed from ${ownerLabel(labeler)}.`);
      } else {
        await api.subscribeLabeler({ labelerId: labeler.id }, accessToken);
        setSubscribedIds((current) => new Set(current).add(labeler.id));
        setUnsubscribedIds((current) => {
          const next = new Set(current);
          next.delete(labeler.id);
          return next;
        });
        setNotice(`Subscribed to ${ownerLabel(labeler)}.`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function cycleValueAction(): Promise<void> {
    if (labeler === undefined || busy) return;
    const entry = labeler.vocabulary[vocabIndex];
    if (entry === undefined) return;
    if (entry.mandatory) {
      setNotice(
        `${sanitizeForTerminal(entry.value)} is mandatory on this node — cannot be changed.`,
      );
      return;
    }
    const key = `${labeler.id}:${entry.value}`;
    const current = overrides.get(key) ?? entry.defaultAction;
    const next = ACTION_CYCLE[(ACTION_CYCLE.indexOf(current) + 1) % ACTION_CYCLE.length] ?? current;
    setBusy(true);
    try {
      const accessToken = await ensureAccessToken();
      await api.setLabelerSubscriptionAction(
        { labelerId: labeler.id, value: entry.value, action: next },
        accessToken,
      );
      setOverrides((currentMap) => new Map(currentMap).set(key, next));
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
      if (items.length === 0) return;
      if (input === 'j' || key.downArrow) {
        setSelected(Math.min(items.length - 1, index + 1));
        setValueIndex(0);
        return;
      }
      if (input === 'k' || key.upArrow) {
        setSelected(Math.max(0, index - 1));
        setValueIndex(0);
        return;
      }
      if (
        labeler !== undefined &&
        labeler.vocabulary.length > 0 &&
        (input === 'l' || key.rightArrow)
      ) {
        setValueIndex((current) => Math.min(labeler.vocabulary.length - 1, current + 1));
        return;
      }
      if (labeler !== undefined && (input === 'h' || key.leftArrow)) {
        setValueIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (input === 'S' || input === 'U') {
        void toggleSubscribe();
        return;
      }
      if (input === 'a') {
        void cycleValueAction();
        return;
      }
      if (hasMore && (input === 'm' || key.pageDown)) loadMore();
    },
    { isActive },
  );

  return (
    <Box flexDirection="column">
      <Text color={theme.accent}>Labelers</Text>
      {error === undefined ? null : (
        <Text color={theme.error}>{sanitizeForTerminal(error.title)}</Text>
      )}
      {items.length === 0 ? (
        loading ? (
          <Loading label="Loading labelers" />
        ) : (
          <Text color={theme.muted}>No labelers published on this node yet.</Text>
        )
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {items.map((candidate, rowIndex) => (
            <Text
              key={candidate.id}
              color={isActive && rowIndex === index ? theme.accent : theme.muted}
              bold={isActive && rowIndex === index}
              wrap="truncate-end"
            >
              {rowIndex === index ? '› ' : '  '}
              {ownerLabel(candidate)}
              {subscribedIds.has(candidate.id) && !unsubscribedIds.has(candidate.id)
                ? ' · subscribed'
                : ''}
            </Text>
          ))}
        </Box>
      )}
      {labeler === undefined || labeler.vocabulary.length === 0 ? null : (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Values</Text>
          {labeler.vocabulary.map((entry, entryIndex) => {
            const key = `${labeler.id}:${entry.value}`;
            const action = overrides.get(key) ?? entry.defaultAction;
            return (
              <Text
                key={entry.value}
                color={entryIndex === vocabIndex ? theme.accent : theme.muted}
                bold={entryIndex === vocabIndex}
              >
                {entryIndex === vocabIndex ? '› ' : '  '}
                {sanitizeForTerminal(entry.value)}: {actionLabel(action)}
                {entry.mandatory ? ' (mandatory)' : ''}
              </Text>
            );
          })}
        </Box>
      )}
      {loadingMore ? <Loading label="Loading more" /> : null}
      {notice === '' ? null : <Text color={theme.ok}>{notice}</Text>}
      <Text color={theme.muted}>
        {`j/k select · h/l value · S subscribe · U unsubscribe · a cycle action${hasMore ? ' · m more' : ''} · Esc back`}
      </Text>
    </Box>
  );
}

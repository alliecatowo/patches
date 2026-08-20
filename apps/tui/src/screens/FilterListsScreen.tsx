import { FILTER_ACTION, FILTER_TERM_KIND } from '../api/wire/enums.js';
import type { FilterList, FilterListSubscription, FilterTermKind } from '../api/wire/types.js';
import { useCallback, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import type { PatchesApi } from '../api/client.js';
import { present } from '../api/present.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { Loading } from '../components/Loading.js';
import { usePaginatedList, type Page } from '../hooks/usePaginatedPosts.js';
import { theme } from '../theme/index.js';

export interface FilterListsScreenProps {
  api: PatchesApi;
  isActive: boolean;
  ensureAccessToken: () => Promise<string>;
  /** `Esc` — back to whichever screen `:lists` was opened from. */
  onBack: () => void;
}

type Tab = 'browse' | 'mine';

function ownerLabel(list: FilterList): string {
  if (present(list.ownerActor)) return `@${sanitizeForTerminal(list.ownerActor.handle)}`;
  if (present(list.ownerCommunity)) return `+${sanitizeForTerminal(list.ownerCommunity.name)}`;
  return 'unknown';
}

const KIND_CYCLE: readonly FilterTermKind[] = [
  FILTER_TERM_KIND.SUBSTRING,
  FILTER_TERM_KIND.WORD,
  FILTER_TERM_KIND.TAG,
  FILTER_TERM_KIND.ACTOR,
  FILTER_TERM_KIND.DOMAIN,
];

// protobuf-es enums are numeric with an automatic reverse mapping (ADR 0023): indexing
// the enum object by value is already the prefix-stripped member name.
function kindLabel(kind: FilterTermKind): string {
  return FILTER_TERM_KIND[kind].toLowerCase();
}

type PublishField = 'name' | 'displayName' | 'kind' | 'value';
const PUBLISH_FIELDS: readonly PublishField[] = ['name', 'displayName', 'kind', 'value'];

interface PublishState {
  field: PublishField;
  name: string;
  displayName: string;
  kind: FilterTermKind;
  value: string;
  submitting: boolean;
  error: string;
}

function emptyPublish(): PublishState {
  return {
    field: 'name',
    name: '',
    displayName: '',
    kind: FILTER_TERM_KIND.DOMAIN,
    value: '',
    submitting: false,
    error: '',
  };
}

/**
 * `:lists` — publicly published filter lists (spec §199): browse, subscribe/
 * unsubscribe, and publish your own. Per-entry exceptions stay CLI-only
 * (`patches lists exception`) — a keyed toggle per entry needs its own entries
 * view this screen doesn't have room for yet.
 */
export function FilterListsScreen({
  api,
  isActive,
  ensureAccessToken,
  onBack,
}: FilterListsScreenProps): ReactElement {
  const [tab, setTab] = useState<Tab>('browse');
  const [browseSelected, setBrowseSelected] = useState(0);
  const [mineSelected, setMineSelected] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [publish, setPublish] = useState<PublishState>(emptyPublish());
  const [subscribedIds, setSubscribedIds] = useState<ReadonlySet<string>>(new Set());
  const [unsubscribedIds, setUnsubscribedIds] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState('');

  const fetchBrowse = useCallback(
    async (cursor: string): Promise<Page<FilterList>> => {
      const accessToken = await ensureAccessToken().catch(() => undefined);
      const response = await api.listFilterLists(
        { ownerActorId: '', cursor, limit: 30 },
        accessToken,
      );
      return { items: response.filterLists, page: response.page };
    },
    [api, ensureAccessToken],
  );
  const browse = usePaginatedList<FilterList>(api.target, fetchBrowse);

  const fetchMine = useCallback(
    async (cursor: string): Promise<Page<FilterListSubscription>> => {
      const accessToken = await ensureAccessToken();
      const response = await api.listFilterListSubscriptions({ cursor, limit: 30 }, accessToken);
      return { items: response.subscriptions, page: response.page };
    },
    [api, ensureAccessToken],
  );
  const mine = usePaginatedList<FilterListSubscription>(api.target, fetchMine);

  const mySubscribedIds = new Set([
    ...mine.items.flatMap((subscription) =>
      present(subscription.filterList) ? [subscription.filterList.id] : [],
    ),
    ...subscribedIds,
  ]);
  for (const id of unsubscribedIds) mySubscribedIds.delete(id);

  const browseIndex = Math.min(browseSelected, Math.max(browse.items.length - 1, 0));
  const mineList = mine.items.filter(
    (subscription) =>
      present(subscription.filterList) && !unsubscribedIds.has(subscription.filterList.id),
  );
  const mineIndex = Math.min(mineSelected, Math.max(mineList.length - 1, 0));

  async function subscribeSelected(): Promise<void> {
    const list = browse.items[browseIndex];
    if (list === undefined) return;
    const accessToken = await ensureAccessToken();
    await api.subscribeFilterList(
      // Empty `scopes` defaults to every scope (P14-022) — this screen has no per-scope UI yet.
      { filterListId: list.id, action: FILTER_ACTION.COLLAPSE, scopes: [] },
      accessToken,
    );
    setSubscribedIds((current) => new Set(current).add(list.id));
    setUnsubscribedIds((current) => {
      const next = new Set(current);
      next.delete(list.id);
      return next;
    });
    setNotice(`Subscribed to ${sanitizeForTerminal(list.displayName || list.name)}.`);
  }

  async function unsubscribeSelected(): Promise<void> {
    const subscription = mineList[mineIndex];
    const list = subscription?.filterList;
    if (list === undefined) return;
    const accessToken = await ensureAccessToken();
    await api.unsubscribeFilterList({ filterListId: list.id }, accessToken);
    setUnsubscribedIds((current) => new Set(current).add(list.id));
    setNotice(`Unsubscribed from ${sanitizeForTerminal(list.displayName || list.name)}.`);
  }

  async function submitPublish(): Promise<void> {
    if (publish.name.trim() === '' || publish.submitting) return;
    setPublish((current) => ({ ...current, submitting: true, error: '' }));
    try {
      const accessToken = await ensureAccessToken();
      const entries =
        publish.value.trim() === '' ? [] : [{ kind: publish.kind, value: publish.value }];
      await api.publishFilterList(
        {
          name: publish.name.trim(),
          displayName: publish.displayName.trim() || publish.name.trim(),
          description: '',
          ownerCommunityId: '',
          entries,
        },
        accessToken,
      );
      setNotice(`Published “${sanitizeForTerminal(publish.name.trim())}”.`);
      setPublish(emptyPublish());
      setPublishing(false);
      browse.refresh();
    } catch (thrown) {
      setPublish((current) => ({
        ...current,
        submitting: false,
        error: thrown instanceof Error ? thrown.message : String(thrown),
      }));
    }
  }

  useInput(
    (input, key) => {
      if (publishing) {
        if (key.escape) {
          setPublish(emptyPublish());
          setPublishing(false);
          return;
        }
        if (publish.submitting) return;
        if (key.tab || (key.return && publish.field === 'value')) {
          if (key.return && publish.field === 'value') {
            void submitPublish();
            return;
          }
          const currentIndex = PUBLISH_FIELDS.indexOf(publish.field);
          const next = PUBLISH_FIELDS[(currentIndex + 1) % PUBLISH_FIELDS.length];
          if (next !== undefined) setPublish((current) => ({ ...current, field: next }));
          return;
        }
        if (publish.field === 'kind' && (input === 'l' || key.rightArrow)) {
          setPublish((current) => ({
            ...current,
            kind:
              KIND_CYCLE[(KIND_CYCLE.indexOf(current.kind) + 1) % KIND_CYCLE.length] ??
              current.kind,
          }));
          return;
        }
        if (publish.field === 'kind' && (input === 'h' || key.leftArrow)) {
          setPublish((current) => ({
            ...current,
            kind:
              KIND_CYCLE[
                (KIND_CYCLE.indexOf(current.kind) - 1 + KIND_CYCLE.length) % KIND_CYCLE.length
              ] ?? current.kind,
          }));
          return;
        }
        if (publish.field !== 'kind' && (key.backspace || key.delete)) {
          setPublish((current) => ({
            ...current,
            // The guard above (`field !== 'kind'`) makes this always a string at runtime; TS
            // doesn't correlate a computed-key union across name/displayName/kind/value the
            // way ts-proto's string enums accidentally let `.slice()` typecheck on every
            // branch before (ADR 0023 — protobuf-es enums are numbers, not strings).
            [current.field]: (current[current.field] as string).slice(0, -1),
          }));
          return;
        }
        if (publish.field !== 'kind' && !key.ctrl && !key.meta && input.length > 0) {
          setPublish((current) => ({
            ...current,
            [current.field]: current[current.field] + input,
          }));
        }
        return;
      }

      if (key.escape) {
        onBack();
        return;
      }
      if (key.tab) {
        setTab((current) => (current === 'browse' ? 'mine' : 'browse'));
        return;
      }
      if (input === 'p') {
        setPublish(emptyPublish());
        setPublishing(true);
        return;
      }
      if (tab === 'browse') {
        if (browse.items.length === 0) return;
        if (input === 'j' || key.downArrow)
          setBrowseSelected(Math.min(browse.items.length - 1, browseIndex + 1));
        else if (input === 'k' || key.upArrow) setBrowseSelected(Math.max(0, browseIndex - 1));
        else if (input === 'S') void subscribeSelected();
        else if (browse.hasMore && (input === 'm' || key.pageDown)) browse.loadMore();
        return;
      }
      if (mineList.length === 0) return;
      if (input === 'j' || key.downArrow)
        setMineSelected(Math.min(mineList.length - 1, mineIndex + 1));
      else if (input === 'k' || key.upArrow) setMineSelected(Math.max(0, mineIndex - 1));
      else if (input === 'U') void unsubscribeSelected();
      else if (mine.hasMore && (input === 'm' || key.pageDown)) mine.loadMore();
    },
    { isActive },
  );

  if (publishing) {
    return (
      <Box flexDirection="column">
        <Text color={theme.accent}>Publish a filter list</Text>
        <Field label="name" value={publish.name} focused={publish.field === 'name'} />
        <Field
          label="display"
          value={publish.displayName}
          focused={publish.field === 'displayName'}
        />
        <Field label="kind" value={kindLabel(publish.kind)} focused={publish.field === 'kind'} />
        <Field label="term" value={publish.value} focused={publish.field === 'value'} />
        {publish.error === '' ? null : (
          <Text color={theme.error}>{sanitizeForTerminal(publish.error)}</Text>
        )}
        <Text color={theme.muted}>
          {publish.submitting
            ? 'Publishing…'
            : 'Tab next field · h/l change kind · Enter on term publishes (add more via patches lists publish) · Esc cancel'}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color={theme.accent}>Filter lists — {tab === 'browse' ? 'browse' : 'mine'}</Text>
      {tab === 'browse' ? (
        <Box flexDirection="column" marginTop={1}>
          {browse.error === undefined ? null : (
            <Text color={theme.error}>{sanitizeForTerminal(browse.error.title)}</Text>
          )}
          {browse.items.length === 0 ? (
            browse.loading ? (
              <Loading label="Loading filter lists" />
            ) : (
              <Text color={theme.muted}>No published filter lists yet.</Text>
            )
          ) : (
            browse.items.map((list, index) => (
              <Text
                key={list.id}
                color={isActive && index === browseIndex ? theme.accent : theme.muted}
                bold={isActive && index === browseIndex}
                wrap="truncate-end"
              >
                {index === browseIndex ? '› ' : '  '}
                {sanitizeForTerminal(list.displayName || list.name)} · {ownerLabel(list)}
                {mySubscribedIds.has(list.id) ? ' · subscribed' : ''}
              </Text>
            ))
          )}
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {mine.error === undefined ? null : (
            <Text color={theme.error}>{sanitizeForTerminal(mine.error.title)}</Text>
          )}
          {mineList.length === 0 ? (
            mine.loading ? (
              <Loading label="Loading subscriptions" />
            ) : (
              <Text color={theme.muted}>No subscriptions yet.</Text>
            )
          ) : (
            mineList.map((subscription, index) => (
              <Text
                key={subscription.filterList?.id ?? String(index)}
                color={isActive && index === mineIndex ? theme.accent : theme.muted}
                bold={isActive && index === mineIndex}
                wrap="truncate-end"
              >
                {index === mineIndex ? '› ' : '  '}
                {present(subscription.filterList)
                  ? sanitizeForTerminal(
                      subscription.filterList.displayName || subscription.filterList.name,
                    )
                  : 'unknown'}{' '}
                · {subscription.action}
              </Text>
            ))
          )}
        </Box>
      )}
      {notice === '' ? null : <Text color={theme.ok}>{notice}</Text>}
      <Text color={theme.muted}>
        Tab browse/mine · j/k select · {tab === 'browse' ? 'S subscribe' : 'U unsubscribe'} · p
        publish
        {(tab === 'browse' ? browse.hasMore : mine.hasMore) ? ' · m more' : ''} · Esc back
      </Text>
    </Box>
  );
}

function Field({
  label,
  value,
  focused,
}: {
  label: string;
  value: string;
  focused: boolean;
}): ReactElement {
  return (
    <Box>
      <Box width={10}>
        <Text color={theme.muted}>{label}</Text>
      </Box>
      <Text color={focused ? theme.accent : theme.text}>
        {value}
        {focused ? '█' : ''}
      </Text>
    </Box>
  );
}

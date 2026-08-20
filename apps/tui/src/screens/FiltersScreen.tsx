import { FILTER_ACTION, FILTER_TERM_KIND } from '../api/wire/enums.js';
import type { Filter, FilterAction, FilterTermKind } from '../api/wire/types.js';
import { useCallback, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import type { PatchesApi } from '../api/client.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { Loading } from '../components/Loading.js';
import { usePaginatedList, type Page } from '../hooks/usePaginatedPosts.js';
import { theme } from '../theme/index.js';

export interface FiltersScreenProps {
  api: PatchesApi;
  isActive: boolean;
  ensureAccessToken: () => Promise<string>;
  /** Opens the shared measured `ConfirmDialog` before deleting a filter. */
  onConfirm: (request: { id: string; title: string; body: string; onConfirm: () => void }) => void;
  /** `Esc` — back to whichever screen `:filters` was opened from. */
  onBack: () => void;
}

const KIND_CYCLE: readonly FilterTermKind[] = [
  FILTER_TERM_KIND.SUBSTRING,
  FILTER_TERM_KIND.WORD,
  FILTER_TERM_KIND.TAG,
  FILTER_TERM_KIND.ACTOR,
  FILTER_TERM_KIND.DOMAIN,
];
const ACTION_CYCLE: readonly FilterAction[] = [
  FILTER_ACTION.COLLAPSE,
  FILTER_ACTION.WARN,
  FILTER_ACTION.HIDE,
];

function kindLabel(kind: FilterTermKind): string {
  return kind.replace('FILTER_TERM_KIND_', '').toLowerCase();
}
function actionLabel(action: FilterAction): string {
  return action.replace('FILTER_ACTION_', '').toLowerCase();
}

function describeFilterRow(filter: Filter): string {
  const terms = filter.terms
    .map((term) => `${kindLabel(term.kind)}:${sanitizeForTerminal(term.value)}`)
    .join(', ');
  return `${sanitizeForTerminal(filter.name)} — ${actionLabel(filter.action)} — ${terms}`;
}

type CreateField = 'name' | 'kind' | 'value' | 'action';
const CREATE_FIELDS: readonly CreateField[] = ['name', 'kind', 'value', 'action'];

interface CreateState {
  field: CreateField;
  name: string;
  kind: FilterTermKind;
  value: string;
  action: FilterAction;
  submitting: boolean;
  error: string;
}

function emptyCreate(): CreateState {
  return {
    field: 'name',
    name: '',
    kind: FILTER_TERM_KIND.SUBSTRING,
    value: '',
    action: FILTER_ACTION.COLLAPSE,
    submitting: false,
    error: '',
  };
}

/**
 * `:filters` — the caller's own bring-your-own filters (spec §198). Creation here
 * covers the common case (one term); multi-term filters and JSON import go through
 * `patches filter create --term ... --term ...` / `patches filter import`.
 */
export function FiltersScreen({
  api,
  isActive,
  ensureAccessToken,
  onConfirm,
  onBack,
}: FiltersScreenProps): ReactElement {
  const [view, setView] = useState<'list' | 'create'>('list');
  const [create, setCreate] = useState<CreateState>(emptyCreate());
  const [added, setAdded] = useState<readonly Filter[]>([]);
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState(0);
  const [notice, setNotice] = useState('');
  const [exporting, setExporting] = useState(false);

  const fetchPage = useCallback(
    async (cursor: string): Promise<Page<Filter>> => {
      const accessToken = await ensureAccessToken();
      const response = await api.listFilters({ cursor, limit: 50 }, accessToken);
      return { items: response.filters, page: response.page };
    },
    [api, ensureAccessToken],
  );
  const { items, loading, loadingMore, hasMore, error, loadMore } = usePaginatedList<Filter>(
    api.target,
    fetchPage,
  );

  const filters = [...added, ...items].filter((filter) => !removedIds.has(filter.id));
  const index = Math.min(selected, Math.max(filters.length - 1, 0));

  async function submitCreate(): Promise<void> {
    if (create.name.trim() === '' || create.value.trim() === '' || create.submitting) return;
    setCreate((current) => ({ ...current, submitting: true, error: '' }));
    try {
      const accessToken = await ensureAccessToken();
      const response = await api.createFilter(
        {
          name: create.name.trim(),
          terms: [{ kind: create.kind, value: create.value }],
          scopes: [],
          action: create.action,
          expiresAt: undefined,
        },
        accessToken,
      );
      if (response.filter !== undefined)
        setAdded((current) => [response.filter as Filter, ...current]);
      setCreate(emptyCreate());
      setView('list');
    } catch (thrown) {
      setCreate((current) => ({
        ...current,
        submitting: false,
        error: thrown instanceof Error ? thrown.message : String(thrown),
      }));
    }
  }

  async function deleteSelected(): Promise<void> {
    const filter = filters[index];
    if (filter === undefined) return;
    const accessToken = await ensureAccessToken();
    await api.deleteFilter({ id: filter.id }, accessToken);
    setRemovedIds((current) => new Set(current).add(filter.id));
  }

  function requestDelete(): void {
    const filter = filters[index];
    if (filter === undefined) return;
    onConfirm({
      id: `filter:delete:${filter.id}`,
      title: `Delete “${sanitizeForTerminal(filter.name)}”?`,
      body: 'This filter stops applying immediately.',
      onConfirm: () => void deleteSelected(),
    });
  }

  async function runExport(): Promise<void> {
    if (exporting) return;
    setExporting(true);
    try {
      const accessToken = await ensureAccessToken();
      const response = await api.exportFilters(accessToken);
      setNotice(`Exported ${String(filters.length)} filter(s) — full JSON: patches filter export`);
      void response;
    } finally {
      setExporting(false);
    }
  }

  useInput(
    (input, key) => {
      if (view === 'create') {
        if (key.escape) {
          setCreate(emptyCreate());
          setView('list');
          return;
        }
        if (create.submitting) return;
        if (key.tab || key.return) {
          const currentIndex = CREATE_FIELDS.indexOf(create.field);
          if (key.return && create.field === 'action') {
            void submitCreate();
            return;
          }
          const next = CREATE_FIELDS[(currentIndex + 1) % CREATE_FIELDS.length];
          if (next !== undefined) setCreate((current) => ({ ...current, field: next }));
          return;
        }
        if (create.field === 'kind' && (input === 'l' || key.rightArrow)) {
          setCreate((current) => ({
            ...current,
            kind:
              KIND_CYCLE[(KIND_CYCLE.indexOf(current.kind) + 1) % KIND_CYCLE.length] ??
              current.kind,
          }));
          return;
        }
        if (create.field === 'kind' && (input === 'h' || key.leftArrow)) {
          setCreate((current) => ({
            ...current,
            kind:
              KIND_CYCLE[
                (KIND_CYCLE.indexOf(current.kind) - 1 + KIND_CYCLE.length) % KIND_CYCLE.length
              ] ?? current.kind,
          }));
          return;
        }
        if (create.field === 'action' && (input === 'l' || key.rightArrow)) {
          setCreate((current) => ({
            ...current,
            action:
              ACTION_CYCLE[(ACTION_CYCLE.indexOf(current.action) + 1) % ACTION_CYCLE.length] ??
              current.action,
          }));
          return;
        }
        if (create.field === 'action' && (input === 'h' || key.leftArrow)) {
          setCreate((current) => ({
            ...current,
            action:
              ACTION_CYCLE[
                (ACTION_CYCLE.indexOf(current.action) - 1 + ACTION_CYCLE.length) %
                  ACTION_CYCLE.length
              ] ?? current.action,
          }));
          return;
        }
        if (
          (create.field === 'name' || create.field === 'value') &&
          (key.backspace || key.delete)
        ) {
          setCreate((current) => ({
            ...current,
            [current.field]: current[current.field].slice(0, -1),
          }));
          return;
        }
        if (
          (create.field === 'name' || create.field === 'value') &&
          !key.ctrl &&
          !key.meta &&
          input.length > 0
        ) {
          setCreate((current) => ({ ...current, [current.field]: current[current.field] + input }));
        }
        return;
      }

      if (key.escape) {
        onBack();
        return;
      }
      if (input === 'n') {
        setCreate(emptyCreate());
        setView('create');
        return;
      }
      if (input === 'x') {
        void runExport();
        return;
      }
      if (input === 'X') {
        requestDelete();
        return;
      }
      if (filters.length === 0) return;
      if (input === 'j' || key.downArrow) {
        setSelected(Math.min(filters.length - 1, index + 1));
        return;
      }
      if (input === 'k' || key.upArrow) {
        setSelected(Math.max(0, index - 1));
        return;
      }
      if (hasMore && (input === 'm' || key.pageDown)) loadMore();
    },
    { isActive },
  );

  if (view === 'create') {
    return (
      <Box flexDirection="column">
        <Text color={theme.accent}>New filter</Text>
        <Field label="name" value={create.name} focused={create.field === 'name'} />
        <Field label="kind" value={kindLabel(create.kind)} focused={create.field === 'kind'} />
        <Field label="term" value={create.value} focused={create.field === 'value'} />
        <Field
          label="action"
          value={actionLabel(create.action)}
          focused={create.field === 'action'}
        />
        {create.error === '' ? null : (
          <Text color={theme.error}>{sanitizeForTerminal(create.error)}</Text>
        )}
        <Text color={theme.muted}>
          {create.submitting
            ? 'Creating…'
            : 'Tab next field · h/l change kind/action · Enter on action submits · Esc cancel'}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color={theme.accent}>Filters</Text>
      {error === undefined ? null : (
        <Text color={theme.error}>{sanitizeForTerminal(error.title)}</Text>
      )}
      {filters.length === 0 ? (
        loading ? (
          <Loading label="Loading filters" />
        ) : (
          <Text color={theme.muted}>No filters yet — press n to create one.</Text>
        )
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {filters.map((filter, rowIndex) => (
            <Text
              key={filter.id}
              color={isActive && rowIndex === index ? theme.accent : theme.muted}
              bold={isActive && rowIndex === index}
              wrap="truncate-end"
            >
              {rowIndex === index ? '› ' : '  '}
              {describeFilterRow(filter)}
            </Text>
          ))}
        </Box>
      )}
      {loadingMore ? <Loading label="Loading more" /> : null}
      {notice === '' ? null : <Text color={theme.ok}>{notice}</Text>}
      <Text color={theme.muted}>
        j/k select · n new · X delete{hasMore ? ' · m more' : ''} · x export · Esc back
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

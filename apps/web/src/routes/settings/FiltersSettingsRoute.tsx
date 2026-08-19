import { describeError } from '@patches/client';
import { FilterAction, FilterScope, FilterTermKind } from '@patches/proto/es';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type JSX } from 'react';

import { api } from '../../api/client.js';
import { humanizeEnumValue } from '../../lib/enumLabels.js';
import styles from '../AuthForm.module.css';

const TERM_KINDS = [
  FilterTermKind.SUBSTRING,
  FilterTermKind.WORD,
  FilterTermKind.TAG,
  FilterTermKind.ACTOR,
  FilterTermKind.DOMAIN,
];
const ACTIONS = [FilterAction.COLLAPSE, FilterAction.WARN, FilterAction.HIDE];
const SCOPES = [
  FilterScope.HOME,
  FilterScope.LOCAL,
  FilterScope.TAG_FEED,
  FilterScope.COMMUNITY_FEED,
  FilterScope.NOTIFICATIONS,
  FilterScope.SEARCH,
  FilterScope.MESSAGE_REQUESTS,
];

interface DraftTerm {
  kind: FilterTermKind;
  value: string;
}

/**
 * `/settings/filters` (P14-018, spec §198) — personal keyword/tag/actor/domain filters:
 * create with literal terms only (never a user-supplied pattern, §208), scope to where
 * they apply, and a hide/collapse/warn action. Export/import is a plain documented JSON
 * blob (§198.5), never a binary format.
 */
export function FiltersSettingsRoute(): JSX.Element {
  const queryClient = useQueryClient();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [terms, setTerms] = useState<DraftTerm[]>([{ kind: FilterTermKind.SUBSTRING, value: '' }]);
  const [name, setName] = useState('');
  const [action, setAction] = useState<FilterAction>(FilterAction.COLLAPSE);
  const [scopes, setScopes] = useState<FilterScope[]>([FilterScope.HOME]);
  const [importPreview, setImportPreview] = useState<string | null>(null);

  const filtersQuery = useQuery({
    queryKey: ['filters'],
    queryFn: () => api.filters.listFilters({ cursor: '', limit: 100 }),
  });

  const invalidate = (): void => void queryClient.invalidateQueries({ queryKey: ['filters'] });

  const createMutation = useMutation({
    mutationFn: () =>
      api.filters.createFilter({
        name,
        terms: terms
          .filter((t) => t.value.trim() !== '')
          .map((t) => ({ kind: t.kind, value: t.value.trim() })),
        scopes,
        action,
      }),
    onSuccess: () => {
      setName('');
      setTerms([{ kind: FilterTermKind.SUBSTRING, value: '' }]);
      invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.filters.deleteFilter({ id }),
    onSuccess: invalidate,
  });

  const exportMutation = useMutation({
    mutationFn: () => api.filters.exportFilters({}),
    onSuccess: (response) => {
      const blob = new Blob([response.json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'patches-filters.json';
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  const importMutation = useMutation({
    mutationFn: (json: string) => api.filters.importFilters({ json, apply: true }),
    onSuccess: () => {
      setImportPreview(null);
      invalidate();
    },
  });

  const toggleScope = (scope: FilterScope): void =>
    setScopes((current) =>
      current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope],
    );

  return (
    <div className={styles['wrap']} style={{ margin: 0, maxWidth: 'none' }}>
      <h1>Filters</h1>

      <section>
        <h2>Your filters</h2>
        {filtersQuery.isPending ? <p>Loading…</p> : null}
        {filtersQuery.data?.filters.length === 0 ? <p>No filters yet.</p> : null}
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {filtersQuery.data?.filters.map((filter) => (
            <li
              key={filter.id}
              style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}
            >
              <strong>{filter.name || '(unnamed)'}</strong> —{' '}
              {humanizeEnumValue(filter.action, FilterAction)} on{' '}
              {filter.terms.map((t) => t.value).join(', ')}
              <button
                type="button"
                style={{ marginLeft: '0.75rem' }}
                onClick={() => deleteMutation.mutate(filter.id)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2>New filter</h2>
        {createMutation.isError ? (
          <p className={styles['error']}>{describeError(createMutation.error).message}</p>
        ) : null}
        <div className={styles['field']}>
          <label htmlFor="filter-name">Name (shown when a post is collapsed)</label>
          <input id="filter-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {terms.map((term, index) => (
          <div key={index} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <select
              value={term.kind}
              onChange={(e) =>
                setTerms((current) =>
                  current.map((t, i) =>
                    i === index ? { ...t, kind: Number(e.target.value) } : t,
                  ),
                )
              }
            >
              {TERM_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {humanizeEnumValue(kind, FilterTermKind)}
                </option>
              ))}
            </select>
            <input
              value={term.value}
              placeholder="literal text — never a pattern"
              onChange={(e) =>
                setTerms((current) =>
                  current.map((t, i) => (i === index ? { ...t, value: e.target.value } : t)),
                )
              }
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setTerms((current) => [...current, { kind: FilterTermKind.SUBSTRING, value: '' }])
          }
        >
          + term
        </button>
        <div className={styles['field']} style={{ marginTop: '0.75rem' }}>
          <label htmlFor="filter-action">Action</label>
          <select
            id="filter-action"
            value={action}
            onChange={(e) => setAction(Number(e.target.value))}
          >
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {humanizeEnumValue(a, FilterAction)}
              </option>
            ))}
          </select>
        </div>
        <div className={styles['field']}>
          <span>Applies to</span>
          {SCOPES.map((scope) => (
            <label key={scope} style={{ display: 'block' }}>
              <input
                type="checkbox"
                checked={scopes.includes(scope)}
                onChange={() => toggleScope(scope)}
              />{' '}
              {humanizeEnumValue(scope, FilterScope)}
            </label>
          ))}
        </div>
        <button
          type="button"
          className={styles['submit']}
          style={{ width: 'auto' }}
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending || name.trim() === ''}
        >
          Create filter
        </button>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2>Export / import</h2>
        <button
          type="button"
          onClick={() => exportMutation.mutate()}
          disabled={exportMutation.isPending}
        >
          Export JSON
        </button>{' '}
        <button type="button" onClick={() => importInputRef.current?.click()}>
          Import JSON
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            void file.text().then(setImportPreview);
          }}
        />
        {importPreview !== null ? (
          <div style={{ marginTop: '0.5rem' }}>
            <p>Ready to import. This adds filters — it never removes existing ones.</p>
            <button
              type="button"
              className={styles['submit']}
              style={{ width: 'auto' }}
              onClick={() => importMutation.mutate(importPreview)}
              disabled={importMutation.isPending}
            >
              Confirm import
            </button>{' '}
            <button type="button" onClick={() => setImportPreview(null)}>
              Cancel
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

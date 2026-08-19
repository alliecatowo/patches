import { describeError } from '@patches/client';
import { FilterAction, FilterTermKind } from '@patches/proto/es';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type JSX } from 'react';

import { api } from '../../api/client.js';
import { useSession } from '../../hooks/useSession.js';
import { humanizeEnumValue } from '../../lib/enumLabels.js';
import styles from '../AuthForm.module.css';

interface DraftEntry {
  kind: FilterTermKind;
  value: string;
}

/**
 * `/settings/lists` (P14-018, spec §199) — publicly shareable, subscribable filter
 * lists: browse/subscribe/unsubscribe with a chosen action, per-entry exceptions
 * ("this list is right about everything except my friend"), and publishing your own.
 * Subscribing never writes a block row and never changes anyone's feed position.
 */
export function FilterListsSettingsRoute(): JSX.Element {
  const session = useSession();
  const queryClient = useQueryClient();
  const [entries, setEntries] = useState<DraftEntry[]>([
    { kind: FilterTermKind.SUBSTRING, value: '' },
  ]);
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [expandedListId, setExpandedListId] = useState<string | null>(null);

  const subscriptionsQuery = useQuery({
    queryKey: ['filter-list-subscriptions'],
    queryFn: () => api.filterLists.listFilterListSubscriptions({ cursor: '', limit: 50 }),
  });
  const browseQuery = useQuery({
    queryKey: ['filter-lists', 'browse'],
    queryFn: () => api.filterLists.listFilterLists({ ownerActorId: '', cursor: '', limit: 50 }),
  });
  const ownListsQuery = useQuery({
    queryKey: ['filter-lists', 'own', session?.actor.id],
    queryFn: () =>
      api.filterLists.listFilterLists({
        ownerActorId: session?.actor.id ?? '',
        cursor: '',
        limit: 50,
      }),
    enabled: session !== null,
  });
  const entriesQuery = useQuery({
    queryKey: ['filter-list-entries', expandedListId],
    queryFn: () =>
      api.filterLists.listFilterListEntries({
        filterListId: expandedListId ?? '',
        cursor: '',
        limit: 200,
      }),
    enabled: expandedListId !== null,
  });

  const invalidateSubs = (): void =>
    void queryClient.invalidateQueries({ queryKey: ['filter-list-subscriptions'] });

  const subscribeMutation = useMutation({
    mutationFn: (filterListId: string) =>
      api.filterLists.subscribeFilterList({ filterListId, action: FilterAction.COLLAPSE }),
    onSuccess: invalidateSubs,
  });
  const unsubscribeMutation = useMutation({
    mutationFn: (filterListId: string) => api.filterLists.unsubscribeFilterList({ filterListId }),
    onSuccess: invalidateSubs,
  });
  const exceptionMutation = useMutation({
    mutationFn: (vars: { filterListId: string; filterListEntryId: string; excepted: boolean }) =>
      api.filterLists.setFilterListEntryException(vars),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['filter-list-entries', expandedListId] }),
  });

  const publishMutation = useMutation({
    mutationFn: () =>
      api.filterLists.publishFilterList({
        name,
        displayName,
        description,
        ownerCommunityId: '',
        entries: entries
          .filter((e) => e.value.trim() !== '')
          .map((e) => ({ kind: e.kind, value: e.value.trim() })),
      }),
    onSuccess: () => {
      setName('');
      setDisplayName('');
      setDescription('');
      setEntries([{ kind: FilterTermKind.SUBSTRING, value: '' }]);
      void queryClient.invalidateQueries({ queryKey: ['filter-lists', 'own'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.filterLists.deleteFilterList({ id }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['filter-lists', 'own'] }),
  });

  const subscribedIds = new Set(
    subscriptionsQuery.data?.subscriptions.map((s) => s.filterList?.id).filter(Boolean),
  );

  return (
    <div className={styles['wrap']} style={{ margin: 0, maxWidth: 'none' }}>
      <h1>Filter lists</h1>

      <section>
        <h2>Your subscriptions</h2>
        {subscriptionsQuery.data?.subscriptions.length === 0 ? (
          <p>Not subscribed to any list.</p>
        ) : null}
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {subscriptionsQuery.data?.subscriptions.map((sub) => (
            <li
              key={sub.filterList?.id}
              style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}
            >
              <strong>{sub.filterList?.displayName || sub.filterList?.name}</strong> —{' '}
              {humanizeEnumValue(sub.action, FilterAction)}
              <button
                type="button"
                style={{ marginLeft: '0.75rem' }}
                onClick={() =>
                  setExpandedListId(
                    expandedListId === sub.filterList?.id ? null : (sub.filterList?.id ?? null),
                  )
                }
              >
                {expandedListId === sub.filterList?.id ? 'Hide entries' : 'View entries'}
              </button>
              <button
                type="button"
                style={{ marginLeft: '0.5rem' }}
                onClick={() => sub.filterList && unsubscribeMutation.mutate(sub.filterList.id)}
              >
                Unsubscribe
              </button>
              {expandedListId === sub.filterList?.id && entriesQuery.data ? (
                <ul style={{ marginTop: '0.5rem' }}>
                  {entriesQuery.data.entries.map((entry) => (
                    <li key={entry.id}>
                      {entry.value} ({humanizeEnumValue(entry.kind, FilterTermKind)}){' '}
                      <button
                        type="button"
                        onClick={() =>
                          sub.filterList &&
                          exceptionMutation.mutate({
                            filterListId: sub.filterList.id,
                            filterListEntryId: entry.id,
                            excepted: true,
                          })
                        }
                      >
                        Except this entry
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2>Browse public lists</h2>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {browseQuery.data?.filterLists.map((list) => (
            <li
              key={list.id}
              style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}
            >
              <strong>{list.displayName || list.name}</strong>
              {list.description ? ` — ${list.description}` : ''}
              {' by '}@{list.ownerActor?.handle ?? list.ownerCommunity?.name}
              {subscribedIds.has(list.id) ? (
                <span style={{ marginLeft: '0.75rem', color: 'var(--fg-muted)' }}>Subscribed</span>
              ) : (
                <button
                  type="button"
                  style={{ marginLeft: '0.75rem' }}
                  onClick={() => subscribeMutation.mutate(list.id)}
                >
                  Subscribe
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2>Your published lists</h2>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {ownListsQuery.data?.filterLists.map((list) => (
            <li
              key={list.id}
              style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}
            >
              <strong>{list.displayName || list.name}</strong>
              <button
                type="button"
                style={{ marginLeft: '0.75rem' }}
                onClick={() => deleteMutation.mutate(list.id)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2>Publish a list</h2>
        {publishMutation.isError ? (
          <p className={styles['error']}>{describeError(publishMutation.error).message}</p>
        ) : null}
        <div className={styles['field']}>
          <label htmlFor="list-name">Slug name</label>
          <input id="list-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className={styles['field']}>
          <label htmlFor="list-display-name">Display name</label>
          <input
            id="list-display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div className={styles['field']}>
          <label htmlFor="list-description">Description</label>
          <textarea
            id="list-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
        </div>
        {entries.map((entry, index) => (
          <div key={index} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <select
              value={entry.kind}
              onChange={(e) =>
                setEntries((current) =>
                  current.map((v, i) => (i === index ? { ...v, kind: Number(e.target.value) } : v)),
                )
              }
            >
              <option value={FilterTermKind.SUBSTRING}>Substring</option>
              <option value={FilterTermKind.WORD}>Word</option>
              <option value={FilterTermKind.TAG}>Tag</option>
              <option value={FilterTermKind.ACTOR}>Actor</option>
              <option value={FilterTermKind.DOMAIN}>Domain</option>
            </select>
            <input
              value={entry.value}
              placeholder="literal text — never a pattern"
              onChange={(e) =>
                setEntries((current) =>
                  current.map((v, i) => (i === index ? { ...v, value: e.target.value } : v)),
                )
              }
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setEntries((current) => [...current, { kind: FilterTermKind.SUBSTRING, value: '' }])
          }
        >
          + entry
        </button>
        <div>
          <button
            type="button"
            className={styles['submit']}
            style={{ width: 'auto', marginTop: '0.75rem' }}
            onClick={() => publishMutation.mutate()}
            disabled={publishMutation.isPending || name.trim() === ''}
          >
            Publish
          </button>
        </div>
      </section>
    </div>
  );
}

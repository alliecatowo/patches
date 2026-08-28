import type { Actor } from '@patches/proto/es';
import { useEffect, useState, type JSX } from 'react';

import { api } from '../api/client.js';
import styles from './e2ee/messagesFlow.module.css';

/**
 * #298: the one entry point for "who do you mean" across the client — a handle/display-name
 * typeahead, never a raw id prompt. With an empty query it shows who the viewer follows first
 * (people already worth messaging), falling back to `SearchActors` once they type. `ActorService`
 * has no "search within following" mode, so the empty-query case is a client-side merge of
 * `ListFollowing` (self) with the search results once a query exists — see the merge below.
 */
export interface ActorTypeaheadProps {
  readonly viewerActorId: string;
  /** Actor ids to exclude from the results (e.g. the viewer's own id). */
  readonly excludeActorIds?: readonly string[];
  readonly onSelect: (actor: Actor) => void;
  readonly placeholder?: string;
}

const RESULT_LIMIT = 20;

export function ActorTypeahead(props: ActorTypeaheadProps): JSX.Element {
  const {
    viewerActorId,
    excludeActorIds = [],
    onSelect,
    placeholder = 'Search by handle or name',
  } = props;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<readonly Actor[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const trimmed = query.trim();
    const load = async (): Promise<void> => {
      setLoading(true);
      setError(undefined);
      try {
        const actors =
          trimmed === ''
            ? (
                await api.actors.listFollowing({
                  actorId: viewerActorId,
                  cursor: '',
                  limit: RESULT_LIMIT,
                })
              ).actors
            : (await api.actors.searchActors({ query: trimmed, cursor: '', limit: RESULT_LIMIT }))
                .actors;
        if (!cancelled) setResults(actors);
      } catch {
        if (!cancelled) setError('Could not load results.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const timer = window.setTimeout(() => void load(), trimmed === '' ? 0 : 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, viewerActorId]);

  const excluded = new Set(excludeActorIds);
  const visible = results.filter((actor) => !excluded.has(actor.id));

  return (
    <div>
      <input
        type="text"
        className={styles['searchInput']}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        aria-label="Search by handle or name"
        autoFocus
      />
      {error !== undefined ? (
        <p role="alert" className={styles['note']}>
          {error}
        </p>
      ) : null}
      {!loading && error === undefined && visible.length === 0 ? (
        <p className={styles['note']}>
          {query.trim() === '' ? 'Not following anyone yet.' : 'No one found.'}
        </p>
      ) : null}
      <div className={styles['resultList']} role="listbox" aria-label="Search results">
        {visible.map((actor) => (
          <button
            key={actor.id}
            type="button"
            role="option"
            aria-selected="false"
            className={styles['resultRow']}
            onClick={() => onSelect(actor)}
          >
            <span className={styles['resultHandle']}>@{actor.handle}</span>
            {actor.displayName !== '' && actor.displayName !== actor.handle ? (
              <span className={styles['resultName']}>{actor.displayName}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

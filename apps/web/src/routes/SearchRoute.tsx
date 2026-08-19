import { useQuery } from '@tanstack/react-query';
import { useState, type JSX } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { api } from '../api/client.js';
import { PostTimeline } from '../components/PostTimeline.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import styles from './SearchRoute.module.css';

type Tab = 'people' | 'posts';

/** `/search` — people search via `ActorService.SearchActors`; post search via
 * `PostService.SearchPosts` (both chronological result ordering, no ranking). */
export function SearchRoute(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [tab, setTab] = useState<Tab>('people');
  const debouncedQuery = useDebouncedValue(query.trim(), 300);

  const actorsQuery = useQuery({
    queryKey: ['search', 'actors', debouncedQuery],
    queryFn: () => api.actor.searchActors({ query: debouncedQuery, cursor: '', limit: 20 }),
    enabled: tab === 'people' && debouncedQuery.length > 0,
  });

  return (
    <div className={styles['wrap']}>
      <input
        className={styles['input']}
        type="search"
        placeholder="Search people or posts…"
        value={query}
        autoFocus
        onChange={(event) => {
          setQuery(event.target.value);
          setParams(event.target.value ? { q: event.target.value } : {}, { replace: true });
        }}
      />
      <div className={styles['tabs']}>
        <button
          type="button"
          className={`${styles['tab']} ${tab === 'people' ? styles['active'] : ''}`}
          onClick={() => setTab('people')}
        >
          People
        </button>
        <button
          type="button"
          className={`${styles['tab']} ${tab === 'posts' ? styles['active'] : ''}`}
          onClick={() => setTab('posts')}
        >
          Posts
        </button>
      </div>
      {debouncedQuery === '' ? (
        <p style={{ color: 'var(--fg-muted)' }}>Type to search.</p>
      ) : tab === 'people' ? (
        <div>
          {actorsQuery.isPending ? <p>Searching…</p> : null}
          {actorsQuery.data?.actors.length === 0 ? <p>No people found.</p> : null}
          {actorsQuery.data?.actors.map((actor) => (
            <Link key={actor.id} to={`/@${actor.handle}`} className={styles['actorRow']}>
              <img
                className={styles['actorAvatar']}
                src={actor.avatar?.url ?? ''}
                alt=""
                aria-hidden="true"
              />
              <span>
                <strong>{actor.displayName || actor.handle}</strong> @{actor.handle}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <PostTimeline
          queryKey={['search', 'posts', debouncedQuery]}
          fetchPage={(cursor) =>
            api.post.searchPosts({
              query: debouncedQuery,
              cursor,
              limit: 20,
              authorHandle: '',
              includeReplies: false,
            })
          }
          emptyMessage="No posts found."
        />
      )}
    </div>
  );
}

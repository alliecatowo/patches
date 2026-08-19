import { useState, type JSX } from 'react';

import { api } from '../api/client.js';
import { PostTimeline } from '../components/PostTimeline.js';
import { useSession } from '../hooks/useSession.js';
import styles from './HomeRoute.module.css';

type Tab = 'home' | 'local';

/**
 * `/` — the local timeline is public; the home timeline (follows) requires a
 * session. Both are strictly chronological (Amendment B §194: no sort/rank
 * parameter exists on either RPC, so there's nothing here to expose).
 */
export function HomeRoute(): JSX.Element {
  const session = useSession();
  const [tab, setTab] = useState<Tab>(session ? 'home' : 'local');

  return (
    <div>
      <div className={styles['tabs']}>
        {session ? (
          <button
            type="button"
            className={`${styles['tab']} ${tab === 'home' ? styles['active'] : ''}`}
            onClick={() => setTab('home')}
          >
            Home
          </button>
        ) : null}
        <button
          type="button"
          className={`${styles['tab']} ${tab === 'local' ? styles['active'] : ''}`}
          onClick={() => setTab('local')}
        >
          Local
        </button>
      </div>
      {tab === 'home' && session ? (
        <PostTimeline
          queryKey={['feed', 'home']}
          fetchPage={(cursor) => api.feed.listHomeFeed({ cursor, limit: 30 })}
          emptyMessage="No posts yet. Follow people to fill your home timeline."
        />
      ) : (
        <PostTimeline
          queryKey={['feed', 'local']}
          fetchPage={(cursor) => api.feed.listLocalFeed({ cursor, limit: 30 })}
          emptyMessage="No posts on this node yet."
        />
      )}
    </div>
  );
}

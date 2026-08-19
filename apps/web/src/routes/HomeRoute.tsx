import { isSignInRequired } from '@patches/client';
import { useQuery } from '@tanstack/react-query';
import { useState, type JSX } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../api/client.js';
import { PostTimeline } from '../components/PostTimeline.js';
import { useSession } from '../hooks/useSession.js';
import styles from './HomeRoute.module.css';

type Tab = 'home' | 'local';

/**
 * `/` — the local timeline is public; the home timeline (follows) requires a
 * session. Both are strictly chronological (Amendment B §194: no sort/rank
 * parameter exists on either RPC, so there's nothing here to expose).
 *
 * A node may opt into `PUBLIC_READ=false` (owner decision, 2026-08-19): invite-only gates
 * posting, not reading, by default, but an operator can close reads entirely. This route
 * detects that with a tiny probe query (`limit: 1`, only enabled while signed out — a signed-in
 * caller always has a session to read with) sharing `PostTimeline`'s own `queryFn`/cache
 * shape, and shows a sign-in prompt in place of the timeline rather than `PostTimeline`'s
 * generic "couldn't load" message.
 */
export function HomeRoute(): JSX.Element {
  const session = useSession();
  const [tab, setTab] = useState<Tab>(session ? 'home' : 'local');

  const publicReadProbe = useQuery({
    queryKey: ['feed', 'local', 'public-read-probe'],
    queryFn: () => api.feeds.listLocalFeed({ cursor: '', limit: 1 }),
    enabled: session === null,
    retry: false,
  });

  if (
    session === null &&
    publicReadProbe.error !== null &&
    isSignInRequired(publicReadProbe.error)
  ) {
    return (
      <div className={styles['signInRequired']}>
        <p>This node requires sign-in to read its public content.</p>
        <p>
          <Link to="/login">Sign in</Link> or <Link to="/register">create an account</Link> to
          continue.
        </p>
      </div>
    );
  }

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
          fetchPage={(cursor) => api.feeds.listHomeFeed({ cursor, limit: 30 })}
          emptyMessage="No posts yet. Follow people to fill your home timeline."
        />
      ) : (
        <PostTimeline
          queryKey={['feed', 'local']}
          fetchPage={(cursor) => api.feeds.listLocalFeed({ cursor, limit: 30 })}
          emptyMessage="No posts on this node yet."
        />
      )}
    </div>
  );
}

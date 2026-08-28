import { useQuery } from '@tanstack/react-query';
import { useState, type JSX } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../api/client.js';
import { PostTimeline } from '../components/PostTimeline.js';
import { Panel } from '../components/ui/Panel.js';
import { useSession } from '../hooks/useSession.js';
import styles from './HomeRoute.module.css';

type Tab = 'home' | 'local';

/**
 * `/` — the "Everyone here" timeline (every public post on this node, chronological) is
 * public by default; the home timeline (follows) requires a session. Both are strictly
 * chronological (Amendment B §194: no sort/rank parameter exists on either RPC, so
 * there's nothing here to expose).
 *
 * A node may opt into `PUBLIC_READ=false` (owner decision, 2026-08-19): invite-only gates
 * posting, not reading, by default, but an operator can close reads entirely. `NodeService
 * .GetNodeInfo` is exempt from the auth requirement — it's how a signed-out client
 * discovers the read policy in the first place — so this route reads `publicRead` from it
 * directly (B-044) instead of inferring closure from a failed probe request the way an
 * earlier version did. A signed-out visitor on a closed node now sees a designed
 * "invite-only" panel instead of `PostTimeline`'s generic "couldn't load" error, and the
 * "Everyone here" tab is hidden entirely rather than shown and then failing to load.
 */
export function HomeRoute(): JSX.Element {
  const session = useSession();
  const [tab, setTab] = useState<Tab>(session ? 'home' : 'local');

  const nodeInfoQuery = useQuery({
    queryKey: ['node-info', 'home-route'],
    queryFn: () => api.node.getNodeInfo({}),
    enabled: session === null,
    staleTime: 60_000,
  });

  // Signed in: reads are always allowed, `nodeInfoQuery` isn't even enabled. Signed out:
  // wait for the (fast, auth-exempt) node-info probe before deciding anything — firing the
  // local-feed request ahead of knowing the node's read policy would send a request that's
  // certain to fail on a closed node, the exact "error surface instead of a designed state"
  // this fix exists to remove.
  if (session === null && nodeInfoQuery.isPending) {
    return <></>;
  }

  const publicReadClosed = session === null && nodeInfoQuery.data?.publicRead === false;

  if (publicReadClosed) {
    return (
      <div className={styles['inviteOnly']}>
        <Panel
          title="This server is invite-only"
          description="The person who runs this server has closed reading to signed-out visitors. Sign in if you already have an account, or create one with an invite code if someone here has sent you one."
          centered
        >
          <p>
            <Link to="/login">Sign in</Link> or{' '}
            <Link to="/register">create an account with an invite</Link>.
          </p>
        </Panel>
      </div>
    );
  }

  const showLocalTab = session !== null || nodeInfoQuery.data?.publicRead === true;

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
        {showLocalTab ? (
          <button
            type="button"
            className={`${styles['tab']} ${tab === 'local' ? styles['active'] : ''}`}
            onClick={() => setTab('local')}
          >
            Everyone here
          </button>
        ) : null}
      </div>
      {tab === 'local' && showLocalTab ? (
        <p className={styles['tabExplainer']}>Every public post on this server, newest first.</p>
      ) : null}
      {tab === 'home' && session ? (
        <PostTimeline
          queryKey={['feed', 'home']}
          fetchPage={(cursor) => api.feeds.listHomeFeed({ cursor, limit: 30 })}
          emptyMessage="No posts yet. Follow people to fill your home timeline."
        />
      ) : showLocalTab ? (
        <PostTimeline
          queryKey={['feed', 'local']}
          fetchPage={(cursor) => api.feeds.listLocalFeed({ cursor, limit: 30 })}
          emptyMessage="No posts on this server yet."
        />
      ) : null}
    </div>
  );
}

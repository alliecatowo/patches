import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent, type JSX } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../api/client.js';
import { PostTimeline, type PostPage } from '../components/PostTimeline.js';
import { useSavedViews } from '../hooks/useSavedViews.js';
import { useSession } from '../hooks/useSession.js';
import { sourceLabel, type SavedViewSource } from '../lib/savedViews.js';
import styles from './HomeRoute.module.css';

type Tab = 'home' | 'local';

/**
 * #192: named client-side views composed from the caller's existing follows (`home`),
 * tags, or communities — never a new RPC, never a `sort`/`order` parameter. Kept as a
 * strip below the Home/Local tabs rather than a separate route, per the "switcher in
 * the home screen" requirement.
 */
function ViewsBar({
  activeId,
  setActiveId,
}: {
  activeId: string | undefined;
  setActiveId: (id: string | undefined) => void;
}): JSX.Element {
  const { views, create, rename, remove } = useSavedViews();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<SavedViewSource['kind']>('tag');
  const [tag, setTag] = useState('');
  const [communityId, setCommunityId] = useState('');
  const [communityName, setCommunityName] = useState('');
  const [renamingId, setRenamingId] = useState<string | undefined>(undefined);
  const [renameValue, setRenameValue] = useState('');

  const activeView = views.find((view) => view.id === activeId);

  function submitCreate(event: FormEvent): void {
    event.preventDefault();
    const source: SavedViewSource =
      kind === 'tag'
        ? { kind: 'tag', tag: tag.trim().replace(/^#/u, '') }
        : kind === 'community'
          ? {
              kind: 'community',
              communityId: communityId.trim(),
              communityName: communityName.trim(),
            }
          : { kind };
    if (kind === 'tag' && (source as { tag: string }).tag === '') return;
    if (kind === 'community' && (source as { communityId: string }).communityId === '') return;
    const created = create(name, source);
    if (created === undefined) return;
    setName('');
    setTag('');
    setCommunityId('');
    setCommunityName('');
    setCreating(false);
    setActiveId(created.id);
  }

  return (
    <div className={styles['viewsBar']}>
      {views.map((view) =>
        renamingId === view.id ? (
          <form
            key={view.id}
            className={styles['renameForm']}
            onSubmit={(event) => {
              event.preventDefault();
              rename(view.id, renameValue);
              setRenamingId(undefined);
            }}
          >
            <input
              className={styles['renameInput']}
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              aria-label={`Rename view ${view.name}`}
              autoFocus
            />
          </form>
        ) : (
          <span key={view.id} className={styles['viewChip']}>
            <button
              type="button"
              className={`${styles['viewChipButton']} ${activeId === view.id ? styles['active'] : ''}`}
              onClick={() => setActiveId(view.id)}
              title={sourceLabel(view.source)}
            >
              {view.name}
            </button>
            <button
              type="button"
              className={styles['viewChipAction']}
              aria-label={`Rename ${view.name}`}
              onClick={() => {
                setRenamingId(view.id);
                setRenameValue(view.name);
              }}
            >
              ✎
            </button>
            <button
              type="button"
              className={styles['viewChipAction']}
              aria-label={`Delete ${view.name}`}
              onClick={() => {
                if (activeId === view.id) setActiveId(undefined);
                remove(view.id);
              }}
            >
              ✕
            </button>
          </span>
        ),
      )}
      {creating ? (
        <form className={styles['createForm']} onSubmit={submitCreate}>
          <select
            aria-label="View source"
            value={kind}
            onChange={(event) => setKind(event.target.value as SavedViewSource['kind'])}
          >
            <option value="tag">Tag</option>
            <option value="community">Community</option>
            <option value="home">Home (follows)</option>
            <option value="local">Everyone here</option>
          </select>
          {kind === 'tag' ? (
            <input
              placeholder="tag"
              value={tag}
              onChange={(event) => setTag(event.target.value)}
              aria-label="Tag name"
            />
          ) : null}
          {kind === 'community' ? (
            <>
              <input
                placeholder="community id"
                value={communityId}
                onChange={(event) => setCommunityId(event.target.value)}
                aria-label="Community id"
              />
              <input
                placeholder="community name"
                value={communityName}
                onChange={(event) => setCommunityName(event.target.value)}
                aria-label="Community name"
              />
            </>
          ) : null}
          <input
            placeholder="View name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label="View name"
          />
          <button type="submit">Save</button>
          <button type="button" onClick={() => setCreating(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button type="button" className={styles['addViewButton']} onClick={() => setCreating(true)}>
          + View
        </button>
      )}
      {activeView ? (
        <ActiveViewFeed key={activeView.id} source={activeView.source} name={activeView.name} />
      ) : null}
    </div>
  );
}

function ActiveViewFeed({ source, name }: { source: SavedViewSource; name: string }): JSX.Element {
  const fetchPage = (cursor: string): Promise<PostPage> => {
    switch (source.kind) {
      case 'home':
        return api.feeds.listHomeFeed({ cursor, limit: 30 });
      case 'local':
        return api.feeds.listLocalFeed({ cursor, limit: 30 });
      case 'tag':
        return api.feeds.listTagFeed({ tag: source.tag, cursor, limit: 30 });
      case 'community':
        return api.feeds.listCommunityFeed({ communityId: source.communityId, cursor, limit: 30 });
    }
  };
  return (
    <div className={styles['viewPanel']}>
      <PostTimeline
        queryKey={['feed', 'view', source.kind, JSON.stringify(source)]}
        fetchPage={fetchPage}
        emptyMessage={`No posts in “${name}” yet.`}
      />
    </div>
  );
}

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
  const [activeViewId, setActiveViewId] = useState<string | undefined>(undefined);

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
        <h2>This server is invite-only</h2>
        <p>
          The person who runs this server has closed reading to signed-out visitors. Sign in if you
          already have an account, or create one with an invite code if someone here has sent you
          one.
        </p>
        <p>
          <Link to="/login">Sign in</Link> or{' '}
          <Link to="/register">create an account with an invite</Link>.
        </p>
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
      <ViewsBar activeId={activeViewId} setActiveId={setActiveViewId} />
      {activeViewId !== undefined ? null : (
        <>
          {tab === 'local' && showLocalTab ? (
            <p className={styles['tabExplainer']}>
              Every public post on this server, newest first.
            </p>
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
        </>
      )}
    </div>
  );
}

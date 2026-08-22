import { Code, ConnectError } from '@connectrpc/connect';
import { describeError, isSignInRequired } from '@patches/client';
import { useQuery } from '@tanstack/react-query';
import { useState, type JSX } from 'react';
import { Link, useParams } from 'react-router-dom';

import { api } from '../api/client.js';
import { FollowButton } from '../components/FollowButton.js';
import { ModerationActions } from '../components/ModerationActions.js';
import { Nameplate } from '../components/Nameplate.js';
import { PageBlocks } from '../components/PageBlocks.js';
import { PostTimeline } from '../components/PostTimeline.js';
import { RichBody } from '../components/RichBody.js';
import { decodePageDocument } from '../lib/page.js';
import styles from './ProfileRoute.module.css';

type Tab = 'posts' | 'wall';

/** `/@handle` — profile, posts, and the actor's Page "wall". */
export function ProfileRoute(): JSX.Element {
  const { handle } = useParams<{ handle: string }>();
  const [tab, setTab] = useState<Tab>('posts');

  const actorQuery = useQuery({
    queryKey: ['actor', 'by-handle', handle],
    queryFn: () => api.actors.getActorByHandle({ handle: handle ?? '' }),
    enabled: !!handle,
  });

  const pageQuery = useQuery({
    queryKey: ['page', handle],
    queryFn: () => api.pages.getPage({ handle: handle ?? '', slug: '' }),
    enabled: tab === 'wall' && !!handle,
  });

  if (actorQuery.isPending) return <p style={{ padding: '1rem' }}>Loading…</p>;
  if (actorQuery.isError) {
    const error = ConnectError.from(actorQuery.error);
    if (error.code === Code.NotFound) {
      return <p style={{ padding: '1rem' }}>This account doesn&apos;t exist.</p>;
    }
    const described = describeError(error, {
      copy: { signInRequiredHint: 'Sign in or create an account to view profiles.' },
    });
    return (
      <div role="alert" style={{ padding: '1rem' }}>
        <p>{described.message}</p>
        {isSignInRequired(error) ? <Link to="/login">Sign in</Link> : null}
      </div>
    );
  }
  const actor = actorQuery.data?.actor;
  if (!actor) return <p style={{ padding: '1rem' }}>This account doesn&apos;t exist.</p>;

  const pageView = pageQuery.data ? decodePageDocument(pageQuery.data.document) : null;
  const activeBlocks = pageView?.pages[0]?.blocks ?? [];

  return (
    <div>
      <div className={styles['header']}>
        <div className={styles['topRow']}>
          {actor.avatar?.url ? (
            <img className={styles['avatar']} src={actor.avatar.url} alt="" aria-hidden="true" />
          ) : null}
          <FollowButton actorId={actor.id} />
        </div>
        <ModerationActions actorId={actor.id} />
        <h1 className={styles['displayName']}>{actor.displayName || actor.handle}</h1>
        <Nameplate handle={actor.handle} nameplate={actor.nameplate} />
        {actor.bio !== '' ? (
          <div className={styles['bio']}>
            <RichBody source={actor.bio} />
          </div>
        ) : null}
        {actor.locationText !== '' ? <p>{actor.locationText}</p> : null}
        {actor.websiteUrl !== '' ? (
          <p>
            <a href={actor.websiteUrl} target="_blank" rel="noopener noreferrer ugc">
              {actor.websiteUrl}
            </a>
          </p>
        ) : null}
        <div className={styles['counts']}>
          <span>
            <strong>{actor.counts?.posts ?? 0}</strong> posts
          </span>
          <span>
            <strong>{actor.counts?.followers ?? 0}</strong> followers
          </span>
          <span>
            <strong>{actor.counts?.following ?? 0}</strong> following
          </span>
        </div>
      </div>
      <div className={styles['tabs']}>
        <button
          type="button"
          className={`${styles['tab']} ${tab === 'posts' ? styles['active'] : ''}`}
          onClick={() => setTab('posts')}
        >
          Posts
        </button>
        <button
          type="button"
          className={`${styles['tab']} ${tab === 'wall' ? styles['active'] : ''}`}
          onClick={() => setTab('wall')}
        >
          Wall
        </button>
      </div>
      {tab === 'posts' ? (
        <PostTimeline
          queryKey={['feed', 'actor', actor.id]}
          fetchPage={(cursor) => api.feeds.listActorPosts({ actorId: actor.id, cursor, limit: 30 })}
          emptyMessage="No posts yet."
        />
      ) : (
        <div className={styles['wall']}>
          {activeBlocks.length > 0 ? (
            <PageBlocks blocks={activeBlocks} />
          ) : (
            <p style={{ color: 'var(--fg-muted)' }}>No wall content yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

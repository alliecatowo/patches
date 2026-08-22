import type { Actor } from '@patches/proto/es';
import type { JSX } from 'react';
import { Link } from 'react-router-dom';

import { FollowButton } from './FollowButton.js';
import { Nameplate } from './Nameplate.js';
import styles from './ActorList.module.css';

export interface ActorListProps {
  actors: Actor[];
  loading?: boolean;
  emptyMessage: string;
}

export function ActorList({ actors, loading, emptyMessage }: ActorListProps): JSX.Element {
  if (loading) {
    return (
      <div className={styles['list']}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={styles['row']}>
            <div className={styles['actorInfo']}>
              <div
                className="skeleton-shimmer"
                style={{ width: 44, height: 44, borderRadius: '50%' }}
              />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div
                  className="skeleton-shimmer"
                  style={{ height: 16, width: '40%', borderRadius: 4 }}
                />
                <div
                  className="skeleton-shimmer"
                  style={{ height: 12, width: '25%', borderRadius: 4 }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (actors.length === 0) {
    return <p className={styles['empty']}>{emptyMessage}</p>;
  }

  return (
    <div className={styles['list']}>
      {actors.map((actor) => (
        <div key={actor.id} className={styles['row']}>
          <Link to={`/@${actor.handle}`} className={styles['actorInfo']}>
            {actor.avatar?.url ? (
              <img src={actor.avatar.url} alt="" className={styles['avatar']} aria-hidden="true" />
            ) : (
              <div className={styles['avatarPlaceholder']}>
                {actor.handle.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className={styles['meta']}>
              <div className={styles['nameRow']}>
                <span className={styles['displayName']}>{actor.displayName || actor.handle}</span>
                <Nameplate handle={actor.handle} nameplate={actor.nameplate} />
              </div>
              {actor.bio ? <span className={styles['bio']}>{actor.bio}</span> : null}
            </div>
          </Link>
          <FollowButton actorId={actor.id} />
        </div>
      ))}
    </div>
  );
}

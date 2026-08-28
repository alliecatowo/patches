import { Code, ConnectError } from '@connectrpc/connect';
import { describeError, isSignInRequired } from '@patches/client';
import { NameTagStyle, ProfileFrame } from '@patches/proto/es';
import { useQuery } from '@tanstack/react-query';
import { useState, type CSSProperties, type JSX } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { api } from '../api/client.js';
import { ActorList } from '../components/ActorList.js';
import { EditWallDialog } from '../components/EditWallDialog.js';
import { FollowButton } from '../components/FollowButton.js';
import { MessageIcon } from '../components/icons/Icons.js';
import { MediaImage } from '../components/MediaImage.js';
import { ModerationActions } from '../components/ModerationActions.js';
import { Nameplate } from '../components/Nameplate.js';
import { PageBlocks } from '../components/PageBlocks.js';
import { PinnedPosts } from '../components/PinnedPosts.js';
import { PostTimeline } from '../components/PostTimeline.js';
import { RichBody } from '../components/RichBody.js';
import { useSession } from '../hooks/useSession.js';
import { decodePageDocument } from '../lib/page.js';
import { NotFoundRoute } from './NotFoundRoute.js';
import styles from './ProfileRoute.module.css';

type Tab = 'posts' | 'wall' | 'followers' | 'following';

/** The frame enum as a `data-frame` value the CSS can select on (`'none'` for unset/NONE —
 * §184.3 degradation: anything the client cannot render is plain). */
function frameData(actor: { profileFrame: ProfileFrame }): string {
  switch (actor.profileFrame) {
    case ProfileFrame.BORDER:
      return 'border';
    case ProfileFrame.GLOW:
      return 'glow';
    case ProfileFrame.GRADIENT:
      return 'gradient';
    default:
      return 'none';
  }
}

/** §104 client-side scheme allowlist for a URL about to reach a real DOM sink (`<img src>`).
 * The server already rejects a non-http(s) `profile_banner_url` at write time
 * (`profileBannerUrlSchema`), but B-136c wants the same check at the render boundary too —
 * a value from an older/misbehaving federated node, a direct DB edit, or a future write path
 * that forgets the server-side check must not get a second, silent chance to reach `src` with
 * a `data:`/`javascript:` payload. `URL` throws on a relative/unparseable string, which this
 * treats the same as an unsafe scheme (a bannerless profile, never a bare-relative `<img>`). */
function isSafeImageUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function nameTagData(actor: { nameTagStyle: NameTagStyle }): string {
  switch (actor.nameTagStyle) {
    case NameTagStyle.BADGE:
      return 'badge';
    case NameTagStyle.RIBBON:
      return 'ribbon';
    case NameTagStyle.PILLED:
      return 'pilled';
    default:
      return 'none';
  }
}

/** `/@handle` — profile, posts, and the actor's Page "wall". */
export function ProfileRoute(): JSX.Element {
  const { handle } = useParams<{ handle: string }>();
  const session = useSession();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('posts');
  const [editWallOpen, setEditWallOpen] = useState(false);
  const profileHandle =
    handle !== undefined && handle.startsWith('@') && handle.length > 1 && handle[1] !== '@'
      ? handle.slice(1)
      : undefined;

  const actorQuery = useQuery({
    queryKey: ['actor', 'by-handle', profileHandle],
    queryFn: () => api.actors.getActorByHandle({ handle: profileHandle ?? '' }),
    enabled: profileHandle !== undefined,
  });

  const actor = actorQuery.data?.actor;

  // Keyed and fetched by the *canonical* handle (`actor.handle`, as `getActorByHandle`
  // resolved it) rather than whatever case the URL happened to carry — otherwise a link
  // typed/pasted with different casing than the actor's stored handle (lookup is
  // case-insensitive) puts this query under a cache key `EditWallDialog`'s post-save
  // `invalidateQueries(['page', actor.handle])` can never match, so the wall silently
  // shows stale content after a successful save.
  const pageQuery = useQuery({
    queryKey: ['page', actor?.handle ?? profileHandle],
    queryFn: () => api.pages.getPage({ handle: actor?.handle ?? profileHandle ?? '', slug: '' }),
    enabled: tab === 'wall' && actor !== undefined,
  });

  const followersQuery = useQuery({
    queryKey: ['followers', actor?.id],
    queryFn: () => api.actors.listFollowers({ actorId: actor?.id ?? '', cursor: '', limit: 50 }),
    enabled: tab === 'followers' && actor !== undefined,
  });

  const followingQuery = useQuery({
    queryKey: ['following', actor?.id],
    queryFn: () => api.actors.listFollowing({ actorId: actor?.id ?? '', cursor: '', limit: 50 }),
    enabled: tab === 'following' && actor !== undefined,
  });

  if (profileHandle === undefined) return <NotFoundRoute />;
  if (actorQuery.isPending) {
    return (
      <div className={styles['header']}>
        <div className={styles['topRow']}>
          <div className={`${styles['avatarPlaceholder']} skeleton-shimmer`} />
        </div>
        <div className="skeleton-shimmer" style={{ height: 24, width: '40%', borderRadius: 4 }} />
        <div
          className="skeleton-shimmer"
          style={{ height: 16, width: '70%', borderRadius: 4, marginTop: 8 }}
        />
      </div>
    );
  }

  if (actorQuery.isError) {
    const error = ConnectError.from(actorQuery.error);
    if (error.code === Code.NotFound) {
      return (
        <p style={{ padding: '1.5rem', textAlign: 'center' }}>This account doesn&apos;t exist.</p>
      );
    }
    const described = describeError(error, {
      copy: { signInRequiredHint: 'Sign in or create an account to view profiles.' },
    });
    return (
      <div role="alert" style={{ padding: '1.5rem', textAlign: 'center' }}>
        <p>{described.message}</p>
        {isSignInRequired(error) ? <Link to="/login">Sign in</Link> : null}
      </div>
    );
  }

  if (!actor)
    return (
      <p style={{ padding: '1.5rem', textAlign: 'center' }}>This account doesn&apos;t exist.</p>
    );

  const pageView = pageQuery.data ? decodePageDocument(pageQuery.data.document) : null;
  const wallSubPage = pageView?.pages[0];
  const activeBlocks = wallSubPage?.blocks ?? [];

  // Rapid personalization (B-130): accent colour becomes a CSS custom property the profile
  // chrome can consume (`var(--profile-accent, var(--accent))` in the module CSS) — absent
  // when unset, so every consumer falls back to the site default with no special case.
  // `?.`/truthiness (not `!== ''`) so a partial/mock actor missing the fields entirely
  // degrades the same way as an explicit empty string.
  const rawProfileBannerUrl = actor.profileBannerUrl?.trim() ?? '';
  const profileBannerUrl =
    rawProfileBannerUrl !== '' && isSafeImageUrl(rawProfileBannerUrl) ? rawProfileBannerUrl : '';
  const accentColor = actor.accentColor?.trim() ?? '';
  const profileStyle = (
    accentColor === '' ? {} : { '--profile-accent': accentColor }
  ) as CSSProperties & Record<`--${string}`, string>;

  return (
    <div style={profileStyle}>
      {
        // Direct-to-R2 uploaded banner (#324) takes priority over the legacy URL field —
        // resolved client-side via `MediaImage`/`GetMediaDownload`, never a server-inlined URL.
        actor.banner?.mediaId ? (
          <MediaImage mediaId={actor.banner.mediaId} altText="" className={styles['banner']} />
        ) : profileBannerUrl !== '' ? (
          <img
            className={styles['banner']}
            src={profileBannerUrl}
            alt=""
            aria-hidden="true"
            onError={(event) => {
              // A dead banner URL degrades to "no banner" (zero height) rather than a broken
              // image glyph at the top of the profile (§184.3: cosmetics never break the page).
              event.currentTarget.style.display = 'none';
            }}
          />
        ) : null
      }
      <div className={styles['header']} data-frame={frameData(actor)}>
        <div className={styles['topRow']}>
          {
            // Banner overlaps the avatar's bottom edge (#324) — handled purely in CSS
            // (`.avatar`'s negative top margin in ProfileRoute.module.css), same DOM shape
            // for both the uploaded and placeholder states.
            actor.avatar?.mediaId ? (
              <MediaImage mediaId={actor.avatar.mediaId} altText="" className={styles['avatar']} />
            ) : (
              <div className={styles['avatarPlaceholder']}>
                {actor.handle.slice(0, 1).toUpperCase()}
              </div>
            )
          }
          <div className={styles['actionButtonGroup']}>
            {session && session.actor.id !== actor.id ? (
              <button
                type="button"
                className={styles['messageBtn']}
                // #323: the one compose flow, reached by handle. `/messages` owns resolving
                // it, probing whether this actor can be messaged, and enrolling this browser
                // if it has no messaging device yet — none of which belongs on a profile.
                onClick={() => void navigate(`/messages?to=${encodeURIComponent(actor.handle)}`)}
                aria-label={`Send message to @${actor.handle}`}
              >
                <MessageIcon size={16} />
                <span>Message</span>
              </button>
            ) : null}
            <FollowButton actorId={actor.id} />
          </div>
        </div>
        <ModerationActions actorId={actor.id} />
        <div className={styles['nameTagRow']} data-name-tag={nameTagData(actor)}>
          <h1 className={styles['displayName']}>{actor.displayName || actor.handle}</h1>
          <Nameplate handle={actor.handle} nameplate={actor.nameplate} />
        </div>
        {actor.bio !== '' ? (
          <div className={styles['bio']}>
            <RichBody source={actor.bio} />
          </div>
        ) : null}
        {actor.locationText !== '' ? (
          <p className={styles['metaRow']}>📍 {actor.locationText}</p>
        ) : null}
        {actor.websiteUrl !== '' ? (
          <p className={styles['metaRow']}>
            🔗{' '}
            <a href={actor.websiteUrl} target="_blank" rel="noopener noreferrer ugc">
              {actor.websiteUrl}
            </a>
          </p>
        ) : null}
        <div className={styles['counts']}>
          <button
            type="button"
            className={`${styles['countPillBtn']} ${tab === 'posts' ? styles['activeCount'] : ''}`}
            onClick={() => setTab('posts')}
          >
            <strong>{actor.counts?.posts ?? 0}</strong> posts
          </button>
          <button
            type="button"
            className={`${styles['countPillBtn']} ${tab === 'followers' ? styles['activeCount'] : ''}`}
            onClick={() => setTab('followers')}
          >
            <strong>{actor.counts?.followers ?? 0}</strong> followers
          </button>
          <button
            type="button"
            className={`${styles['countPillBtn']} ${tab === 'following' ? styles['activeCount'] : ''}`}
            onClick={() => setTab('following')}
          >
            <strong>{actor.counts?.following ?? 0}</strong> following
          </button>
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
        <button
          type="button"
          className={`${styles['tab']} ${tab === 'followers' ? styles['active'] : ''}`}
          onClick={() => setTab('followers')}
        >
          Followers
        </button>
        <button
          type="button"
          className={`${styles['tab']} ${tab === 'following' ? styles['active'] : ''}`}
          onClick={() => setTab('following')}
        >
          Following
        </button>
      </div>
      {tab === 'posts' ? (
        <PostTimeline
          queryKey={['feed', 'actor', actor.id]}
          fetchPage={(cursor) => api.feeds.listActorPosts({ actorId: actor.id, cursor, limit: 30 })}
          emptyMessage="No posts yet."
        />
      ) : tab === 'wall' ? (
        <div className={styles['wall']}>
          <div className={styles['wallHeader']}>
            <Link to={`/page/@${actor.handle}`} className={styles['viewPageBtn']}>
              View full page →
            </Link>
            {session?.actor.id === actor.id ? (
              <button
                type="button"
                className={styles['editWallBtn']}
                onClick={() => setEditWallOpen(true)}
              >
                + Edit Wall
              </button>
            ) : null}
          </div>

          {pageQuery.data ? <PinnedPosts ownerActorId={pageQuery.data.ownerActorId} /> : null}

          {activeBlocks.length > 0 ? (
            <PageBlocks
              blocks={activeBlocks}
              context={
                pageQuery.data
                  ? {
                      handle: actor.handle,
                      slug: wallSubPage?.slug ?? '',
                      ownerActorId: pageQuery.data.ownerActorId,
                    }
                  : undefined
              }
            />
          ) : (
            <p style={{ color: 'var(--fg-muted)', textAlign: 'center', padding: '2rem' }}>
              No wall content yet.
            </p>
          )}

          {session?.actor.id === actor.id ? (
            <EditWallDialog
              isOpen={editWallOpen}
              onClose={() => setEditWallOpen(false)}
              currentDocument={pageQuery.data?.document}
              handle={actor.handle}
            />
          ) : null}
        </div>
      ) : tab === 'followers' ? (
        <ActorList
          actors={followersQuery.data?.actors ?? []}
          loading={followersQuery.isPending}
          emptyMessage="No followers yet."
        />
      ) : (
        <ActorList
          actors={followingQuery.data?.actors ?? []}
          loading={followingQuery.isPending}
          emptyMessage="Not following anyone yet."
        />
      )}
    </div>
  );
}

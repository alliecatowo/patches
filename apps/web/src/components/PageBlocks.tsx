import { sanitizeText, type RenderablePageBlock } from '@patches/domain';
import { type Actor } from '@patches/proto/es';
import { useQuery } from '@tanstack/react-query';
import { type JSX } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../api/client.js';
import { formatRelativeTime } from '../lib/format.js';
import { safePageHref } from '../lib/page.js';
import { MediaImage } from './MediaImage.js';
import { PostTimeline } from './PostTimeline.js';
import styles from './PageBlocks.module.css';

/** Everything a live block (Posts/TopEight/Guestbook) needs to fetch its own data,
 * mirroring the TUI's `PageRenderContext` shape (`apps/tui/src/pages/render/blocks.tsx`).
 * When a caller omits it, those blocks fall back to the visible placeholder — e.g. a
 * context-free render can't know the owner's actor id. */
export interface PageRenderContext {
  /** Page owner's local handle, no leading `@` (matches `GetPageRequest.handle`). */
  handle: string;
  /** The sub-page slug these blocks sit on — Guestbook entries are keyed by it. */
  slug: string;
  ownerActorId: string;
}

export interface PageBlocksProps {
  blocks: RenderablePageBlock[];
  context?: PageRenderContext | undefined;
}

/**
 * Renders a Patches Page's blocks (spec §170–172) as inert React — text, links, and
 * images only, never `dangerouslySetInnerHTML`. Every free-text field is run through
 * `@patches/domain`'s `sanitizeText` at render time (defense in depth on top of the
 * server's write-time sanitization), and every `Links` href is re-checked by
 * `safePageHref` so a `javascript:`/`data:` URL renders as inert text, never an anchor.
 *
 * Live blocks (`Posts`/`TopEight`/`Guestbook`) fetch their own data when `context` is
 * provided, mirroring the TUI renderer's semantics; unsupported block types
 * (`Gallery`/`Friends`/`Badges`/unknown) show a visible placeholder rather than failing
 * the page (§171's "never fail the page" rule).
 */
export function PageBlocks({ blocks, context }: PageBlocksProps): JSX.Element {
  return (
    <>
      {blocks.map((block, index) => (
        <div className={styles['block']} key={index}>
          {renderBlock(block, context)}
        </div>
      ))}
    </>
  );
}

function renderBlock(
  block: RenderablePageBlock,
  context: PageRenderContext | undefined,
): JSX.Element {
  switch (block.type) {
    case 'Text':
      return <p>{renderBody(block.body)}</p>;
    case 'Markdown':
      return <div>{renderBody(block.body)}</div>;
    case 'Hero':
      return (
        <div>
          <h2>{sanitizeText(block.title)}</h2>
          {block.subtitle ? (
            <p className={styles['muted']}>{sanitizeText(block.subtitle)}</p>
          ) : null}
        </div>
      );
    case 'NowPlaying':
      return <p className={styles['muted']}>♪ {sanitizeText(block.text)}</p>;
    case 'AsciiArt':
      return <pre className={styles['asciiArt']}>{renderBody(block.art)}</pre>;
    case 'Spacer':
      return (
        <div
          style={{ height: block.size === 'lg' ? '3rem' : block.size === 'sm' ? '1rem' : '2rem' }}
        />
      );
    case 'Image':
      return (
        <MediaImage mediaId={block.mediaId} altText={block.alt ? sanitizeText(block.alt) : ''} />
      );
    case 'Links':
      return <LinksBlock block={block} />;
    case 'Posts':
      return context ? (
        <PostsBlock context={context} limit={block.limit ?? 5} />
      ) : (
        <PlaceholderBlock label="Posts block — not supported here" />
      );
    case 'TopEight':
      return context ? (
        <TopEightBlock context={context} actors={block.actors} />
      ) : (
        <PlaceholderBlock label="Top 8 — not supported here" />
      );
    case 'Guestbook':
      return context ? (
        <GuestbookBlock context={context} limit={block.limit ?? 20} />
      ) : (
        <PlaceholderBlock label="Guestbook — not supported here" />
      );
    default:
      return <PlaceholderBlock label={`[${block.type} block — not supported here yet]`} />;
  }
}

/** Text/Markdown/AsciiArt bodies keep their line breaks; everything suspicious was
 * already stripped, this is the render-time second pass. */
function renderBody(body: string): JSX.Element {
  return <>{sanitizeText(body, { multiline: true })}</>;
}

function PlaceholderBlock({ label }: { label: string }): JSX.Element {
  return <p className={styles['placeholder']}>{label}</p>;
}

function LinksBlock({
  block,
}: {
  block: Extract<RenderablePageBlock, { type: 'Links' }>;
}): JSX.Element {
  return (
    <ul>
      {block.links.map((link) => {
        const label = sanitizeText(link.label);
        const href = safePageHref(link.href);
        if (href === null) {
          return (
            <li key={link.href}>
              <span className={styles['rejectedLink']}>{label || link.href}</span>{' '}
              <span className={styles['rejectedLinkNote']}>
                (link removed — not an http(s) URL)
              </span>
            </li>
          );
        }
        return (
          <li key={link.href}>
            <a href={href} target="_blank" rel="noopener noreferrer ugc">
              {label || href}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/** The owner's recent posts, chronological via the same cursor-paginated feed the
 * profile Posts tab uses — never re-sorted or ranked client-side (spec §46/Amendment B). */
function PostsBlock({
  context,
  limit,
}: {
  context: PageRenderContext;
  limit: number;
}): JSX.Element {
  return (
    <div>
      <h3 className={styles['blockTitle']}>Posts</h3>
      <PostTimeline
        queryKey={['page', context.handle, context.slug, 'posts', limit]}
        fetchPage={(cursor) =>
          api.feeds.listActorPosts({ actorId: context.ownerActorId, cursor, limit })
        }
        emptyMessage="No posts yet."
      />
    </div>
  );
}

/** `@handle`/`@handle@node` refs; only a bare local handle resolves (spec §174 —
 * federation is a seam), remote or unresolvable refs render as inert text, mirroring the
 * TUI's `TopEightBlockView`. */
function TopEightBlock({
  context,
  actors,
}: {
  context: PageRenderContext;
  actors: readonly string[];
}): JSX.Element {
  const localHandles = actors.map((ref) => ref.slice(1)).filter((handle) => !handle.includes('@'));
  const resolvedQuery = useQuery({
    queryKey: ['page', context.handle, 'top-eight', localHandles],
    queryFn: async (): Promise<ReadonlyMap<string, Actor | null>> => {
      const entries = await Promise.all(
        localHandles.map(async (handle) => {
          try {
            const response = await api.actors.getActorByHandle({ handle });
            return [handle, response.actor ?? null] as const;
          } catch {
            return [handle, null] as const;
          }
        }),
      );
      return new Map(entries);
    },
    staleTime: 60_000,
  });

  return (
    <div>
      <h3 className={styles['blockTitle']}>Top 8</h3>
      {actors.map((ref, index) => {
        const handle = ref.slice(1);
        const isLocal = !handle.includes('@');
        const actor = isLocal ? resolvedQuery.data?.get(handle) : undefined;
        if (actor !== undefined && actor !== null) {
          return (
            <Link key={`${ref}-${index}`} to={`/@${actor.handle}`} className={styles['actorRow']}>
              {actor.avatar?.url ? (
                <img
                  src={actor.avatar.url}
                  alt=""
                  aria-hidden="true"
                  className={styles['actorAvatar']}
                />
              ) : (
                <div className={styles['actorAvatarPlaceholder']}>
                  {actor.handle.slice(0, 1).toUpperCase()}
                </div>
              )}
              <span className={styles['actorName']}>{actor.displayName || actor.handle}</span>
              <span className={styles['actorHandle']}>@{actor.handle}</span>
            </Link>
          );
        }
        if (actor === null) {
          return (
            <p key={`${ref}-${index}`} className={styles['actorUnavailable']}>
              {`${sanitizeText(ref)} (unavailable)`}
            </p>
          );
        }
        return (
          <p key={`${ref}-${index}`} className={styles['actorUnavailable']}>
            {sanitizeText(ref) + (isLocal ? '' : ' (remote)')}
          </p>
        );
      })}
    </div>
  );
}

/** Guestbook entries, most-recent first as the server returns them (`ListGuestbook`) —
 * read-only on the web for now (signing stays a TUI affordance). */
function GuestbookBlock({
  context,
  limit,
}: {
  context: PageRenderContext;
  limit: number;
}): JSX.Element {
  const guestbookQuery = useQuery({
    queryKey: ['page', context.handle, context.slug, 'guestbook', limit],
    queryFn: () =>
      api.pages.listGuestbook({
        handle: context.handle,
        slug: context.slug,
        cursor: '',
        limit,
      }),
  });

  return (
    <div>
      <h3 className={styles['blockTitle']}>Guestbook</h3>
      {guestbookQuery.isPending ? <p className={styles['muted']}>Loading guestbook…</p> : null}
      {guestbookQuery.isError ? (
        <p className={styles['muted']}>Couldn&apos;t load the guestbook.</p>
      ) : null}
      {guestbookQuery.data?.entries.length === 0 ? (
        <p className={styles['muted']}>No guestbook entries yet.</p>
      ) : null}
      {guestbookQuery.data?.entries.map((entry) => (
        <div key={entry.id} className={styles['guestbookEntry']}>
          <div className={styles['guestbookMeta']}>
            {entry.author ? (
              <Link to={`/@${entry.author.handle}`} className={styles['guestbookAuthor']}>
                {entry.author.displayName || `@${entry.author.handle}`}
              </Link>
            ) : (
              <span className={styles['muted']}>a remote guest</span>
            )}
            <span className={styles['guestbookWhen']}>{formatRelativeTime(entry.createdAt)}</span>
          </div>
          <p className={styles['guestbookBody']}>{sanitizeText(entry.body, { multiline: true })}</p>
        </div>
      ))}
    </div>
  );
}

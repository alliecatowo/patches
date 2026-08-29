import { create } from '@bufbuild/protobuf';
import { MediaAttachmentSchema } from '@patches/proto/es';

import { present } from '../../api/present.js';
import type { PageBlock, RenderablePageBlock } from '@patches/domain';
import { toDate } from '../../api/wire/time.js';
import type { Actor, GuestbookEntry, MediaAttachment, Post } from '../../api/wire/types.js';
import { Fragment, useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import type { ReactElement } from 'react';

import type { PatchesApi } from '../../api/client.js';
import { MediaAttachments } from '../../components/MediaAttachments.js';
import { Nameplate } from '../../components/Nameplate.js';
import { PostRow } from '../../components/PostRow.js';
import { formatRelativeTime } from '../../format/relative-time.js';
import { sanitizeForTerminal } from '../../format/sanitize.js';
import { theme } from '../../theme/index.js';
import { chunkIntoRows, galleryColumnsFor, GRID_GAP_COLUMNS, planPageGrid } from './grid.js';
import { AsciiArtBlockView, renderMarkdown } from './markdown.js';

/** Everything a block needs to render beyond its own fields — one bag so `PageBlockView`
 * doesn't thread eight individual props through every block component (mirrors
 * `PostRowActions`' reasoning in `components/PostList.tsx`). */
export interface PageRenderContext {
  api: PatchesApi;
  handle: string;
  slug: string;
  ownerActorId: string;
  /** Bumped by `PageScreen` after a successful `SignGuestbook` — the only prop
   * `GuestbookBlockView` needs to know "re-fetch, something changed." */
  guestbookRefreshKey: number;
  /** The terminal-cell width of the lane a block is rendering in — set per-lane by
   * `PageBlocksView` from `planPageGrid`, `undefined` outside a sized `PageBlocksView`
   * (most block-level unit tests). Only `AsciiArt` and `Gallery` read this; every other
   * block already wraps at its container's width via Ink's own `<Text wrap="wrap">`. */
  columnWidth?: number;
}

export interface LinkTarget {
  label: string;
  href: string;
}

/** Flattens every `Links` block's entries into one ordered list — `PageScreen` owns
 * `j`/`k`/`Enter` selection across the whole sub-page, not per-block, since a page can
 * have several `Links` blocks and there is only one keyboard. Document order is
 * preserved exactly (never re-sorted/grouped here — grouping is purely a render-time
 * presentation concern, §46/Amendment B). */
export function collectLinks(blocks: readonly RenderablePageBlock[]): LinkTarget[] {
  const links: LinkTarget[] = [];
  for (const block of blocks) {
    if (block.type === 'Links') links.push(...block.links);
  }
  return links;
}

/** How many `Links` entries appear in blocks before `index` — a plain, non-mutating
 * lookup (rather than a running counter reassigned during `Array.map`, which
 * `react-hooks/immutability` flags even though nothing here is React state) so
 * `PageBlocksView`'s render body never reassigns an outer variable. `blocks` per
 * sub-page is capped at 128 (`packages/domain`'s `PAGE_MAX_BLOCKS_PER_PAGE`), so the
 * O(n) rescan per `Links` block is cheap. */
function countLinksBefore(blocks: readonly RenderablePageBlock[], index: number): number {
  let count = 0;
  for (let i = 0; i < index; i += 1) {
    const block = blocks[i];
    if (block?.type === 'Links') count += block.links.length;
  }
  return count;
}

export interface PageBlocksViewProps {
  blocks: readonly RenderablePageBlock[];
  context: PageRenderContext;
  /** Index into `collectLinks(blocks)` — `undefined` selects nothing. */
  selectedLinkIndex: number | undefined;
  /** Total terminal-cell width available to lay these blocks out in — drives the
   * responsive cell grid (P12-109: narrow 1-col / standard 2-col / wide 3-col,
   * `planPageGrid`). Omitted by most direct-render unit tests, which then render the
   * original single-column stack (`context.columnWidth`, if the caller set one
   * directly, passes through unchanged). */
  width?: number;
}

/** Renders every block in a sub-page in order — never throws for a block `packages/
 * domain`'s lenient parser didn't recognize (spec §171: "a renderer MUST … render a
 * visible placeholder rather than failing the page"). */
export function PageBlocksView({
  blocks,
  context,
  selectedLinkIndex,
  width,
}: PageBlocksViewProps): ReactElement {
  if (width === undefined) {
    const entries = blocks.map((block, index) => ({ block, index }));
    return (
      <PageBlocksLane
        entries={entries}
        blocks={blocks}
        context={context}
        selectedLinkIndex={selectedLinkIndex}
      />
    );
  }

  const lanes = planPageGrid(blocks, width);
  const [single] = lanes;
  if (lanes.length === 1 && single !== undefined) {
    return (
      <PageBlocksLane
        entries={single.entries}
        blocks={blocks}
        context={{ ...context, columnWidth: single.width }}
        selectedLinkIndex={selectedLinkIndex}
      />
    );
  }

  return (
    <Box flexDirection="row" width={width} flexShrink={0} overflow="hidden">
      {lanes.map((lane, laneIndex) => (
        <Fragment key={laneIndex}>
          {laneIndex > 0 ? <Box width={GRID_GAP_COLUMNS} flexShrink={0} /> : null}
          <Box width={lane.width} flexShrink={0} overflow="hidden" flexDirection="column">
            <PageBlocksLane
              entries={lane.entries}
              blocks={blocks}
              context={{ ...context, columnWidth: lane.width }}
              selectedLinkIndex={selectedLinkIndex}
            />
          </Box>
        </Fragment>
      ))}
    </Box>
  );
}

function PageBlocksLane({
  entries,
  blocks,
  context,
  selectedLinkIndex,
}: {
  entries: readonly { block: RenderablePageBlock; index: number }[];
  blocks: readonly RenderablePageBlock[];
  context: PageRenderContext;
  selectedLinkIndex: number | undefined;
}): ReactElement {
  return (
    <Box flexDirection="column">
      {entries.map(({ block, index }) => {
        if (block.type === 'Links') {
          const startIndex = countLinksBefore(blocks, index);
          return (
            <LinksBlockView
              key={index}
              block={block}
              startIndex={startIndex}
              selectedLinkIndex={selectedLinkIndex}
            />
          );
        }
        return <PageBlockView key={index} block={block} context={context} />;
      })}
    </Box>
  );
}

function PageBlockView({
  block,
  context,
}: {
  // `Links` blocks are dispatched separately by `PageBlocksView` (they need
  // `startIndex`/`selectedLinkIndex`, not `context`) — excluded here so the switch
  // below can be statically exhaustive without a dead `case 'Links'`.
  block: Exclude<RenderablePageBlock, { type: 'Links' }>;
  context: PageRenderContext;
}): ReactElement {
  switch (block.type) {
    case 'Text':
      return (
        <Box marginBottom={1}>
          <Text wrap="wrap">{sanitizeForTerminal(block.body)}</Text>
        </Box>
      );
    case 'Markdown':
      return (
        <Box flexDirection="column" marginBottom={1}>
          {renderMarkdown(block.body)}
        </Box>
      );
    case 'Image':
      return (
        <Box marginBottom={1}>
          <MediaAttachments attachments={[stubAttachment(block.mediaId, block.alt ?? '')]} />
        </Box>
      );
    case 'Gallery':
      return <GalleryBlockView block={block} columnWidth={context.columnWidth} />;
    case 'Posts':
      return <PostsBlockView context={context} limit={block.limit ?? 5} />;
    case 'TopEight':
      return <TopEightBlockView context={context} actors={block.actors} />;
    case 'Guestbook':
      return <GuestbookBlockView context={context} limit={block.limit ?? 20} />;
    case 'Friends':
      return <FriendsBlockView context={context} limit={block.limit ?? 8} />;
    case 'Badges':
      return (
        <Box marginBottom={1}>
          <Text color={theme.muted}>[badges unavailable]</Text>
        </Box>
      );
    case 'AsciiArt':
      return (
        <Box marginBottom={1}>
          <AsciiArtBlockView
            art={block.art}
            {...(context.columnWidth === undefined ? {} : { width: context.columnWidth })}
          />
        </Box>
      );
    case 'Spacer':
      return <Box height={block.size === 'lg' ? 3 : block.size === 'sm' ? 1 : 2} />;
    case 'Hero':
      return (
        <Box flexDirection="column" marginBottom={1}>
          <Text color={theme.accent} bold>
            {sanitizeForTerminal(block.title)}
          </Text>
          {block.subtitle === '' || block.subtitle === undefined ? null : (
            <Text color={theme.muted}>{sanitizeForTerminal(block.subtitle)}</Text>
          )}
        </Box>
      );
    case 'NowPlaying':
      return (
        <Box marginBottom={1}>
          <Text color={theme.muted}>♪ {sanitizeForTerminal(block.text)}</Text>
        </Box>
      );
    case 'Unknown':
      return (
        <Box marginBottom={1}>
          <Text color={theme.muted}>
            [unsupported block: {sanitizeForTerminal(block.originalType)}]
          </Text>
        </Box>
      );
    default:
      return blockNever(block);
  }
}

/** Exhaustiveness guard — a future `PageBlock` variant `packages/domain` adds but this
 * switch hasn't caught yet fails typecheck here rather than silently rendering nothing. */
function blockNever(block: never): ReactElement {
  return <Text color={theme.muted}>{JSON.stringify(block)}</Text>;
}

/** `Gallery` (§5.5: "shows §75 boxes in a 2–3 column grid with the selected cell
 * inline") — the "selected cell inline" affordance is a `PostList`-row-level Kitty
 * concern (`MediaAttachments`' own `inline` prop); this is the grid arrangement half
 * of that, reusing `MediaAttachments`'s existing §75 fallback box unchanged (art
 * fallback is automatic — the same non-Kitty path a post's own attachments use). */
function GalleryBlockView({
  block,
  columnWidth,
}: {
  block: Extract<PageBlock, { type: 'Gallery' }>;
  columnWidth: number | undefined;
}): ReactElement {
  const width = columnWidth ?? 80;
  const columns = Math.min(galleryColumnsFor(width), block.mediaIds.length) || 1;
  const rows = chunkIntoRows(block.mediaIds, columns);
  const cellWidth = Math.max(10, Math.floor((width - GRID_GAP_COLUMNS * (columns - 1)) / columns));

  return (
    <Box flexDirection="column" marginBottom={1}>
      {block.caption === '' || block.caption === undefined ? null : (
        <Text color={theme.muted}>{sanitizeForTerminal(block.caption)}</Text>
      )}
      {rows.map((row, rowIndex) => (
        <Box key={rowIndex} flexDirection="row">
          {row.map((mediaId, cellIndex) => (
            <Box
              key={mediaId}
              width={cellWidth}
              flexShrink={0}
              marginRight={cellIndex < row.length - 1 ? GRID_GAP_COLUMNS : 0}
            >
              <MediaAttachments
                attachments={[stubAttachment(mediaId, '', rowIndex * columns + cellIndex)]}
                maxCols={cellWidth}
              />
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}

function stubAttachment(mediaId: string, altText: string, position = 0): MediaAttachment {
  // `Image`/`Gallery` blocks only carry a media id + alt text (`packages/domain`'s
  // `imageBlockSchema`) — width/height/mime are resolved the same way `MediaAttachments`
  // already resolves a post attachment's, via `GetMediaDownload` (P5-003's
  // `useMediaAttachment`), so this stub only needs to carry the id through.
  return create(MediaAttachmentSchema, {
    mediaId,
    altText,
    width: 0,
    height: 0,
    mimeType: '',
    position,
  });
}

function LinksBlockView({
  block,
  startIndex,
  selectedLinkIndex,
}: {
  block: Extract<PageBlock, { type: 'Links' }>;
  startIndex: number;
  selectedLinkIndex: number | undefined;
}): ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      {block.links.map((link, index) => {
        const selected = selectedLinkIndex === startIndex + index;
        // A group heading renders whenever the entry's group differs from the previous
        // entry's — the first entry of a (possibly multi-block-flattened-run) group
        // carries the heading. Consecutive entries with the same non-empty group share
        // one heading; a blank/undefined group never emits one (schema-normalized, and
        // also handled here for lenient-parsed documents).
        const prev = block.links[index - 1];
        const groupChanged =
          (link.group ?? '') !== '' && (link.group ?? '') !== (prev?.group ?? '');
        return (
          <Fragment key={index}>
            {groupChanged ? (
              <Text color={theme.muted} bold>
                {sanitizeForTerminal(link.group ?? '')}
              </Text>
            ) : null}
            <Text {...(selected ? { color: theme.accent } : {})} bold={selected}>
              {selected ? '› ' : '  '}
              {sanitizeForTerminal(link.label === '' ? link.href : link.label)}
            </Text>
          </Fragment>
        );
      })}
    </Box>
  );
}

function PostsBlockView({
  context,
  limit,
}: {
  context: PageRenderContext;
  limit: number;
}): ReactElement {
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'ready'; posts: readonly Post[] } | { status: 'error' }
  >({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    context.api
      .listActorPosts({ actorId: context.ownerActorId, cursor: '', limit })
      .then((response) => {
        if (!cancelled) setState({ status: 'ready', posts: response.posts });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [context.api, context.ownerActorId, limit]);

  if (state.status === 'loading') {
    return (
      <Box marginBottom={1}>
        <Text color={theme.muted}>Loading posts…</Text>
      </Box>
    );
  }
  if (state.status === 'error') {
    return (
      <Box marginBottom={1}>
        <Text color={theme.error}>Couldn't load posts.</Text>
      </Box>
    );
  }
  if (state.posts.length === 0) {
    return (
      <Box marginBottom={1}>
        <Text color={theme.muted}>No posts yet.</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" marginBottom={1}>
      {state.posts.map((post) => (
        <PostRow key={post.id} post={post} />
      ))}
    </Box>
  );
}

function TopEightBlockView({
  context,
  actors,
}: {
  context: PageRenderContext;
  actors: readonly string[];
}): ReactElement {
  const [resolved, setResolved] = useState<ReadonlyMap<string, Actor | 'unavailable'>>(new Map());

  useEffect(() => {
    let cancelled = false;
    // Only a bare local `@handle` resolves (spec §174: federation is a seam, not
    // implemented — `ActorService.GetActorByHandle` only knows local handles).
    const localHandles = actors.map((ref) => ref.slice(1)).filter((ref) => !ref.includes('@'));
    void Promise.all(
      localHandles.map((handle) =>
        context.api
          .getActorByHandle({ handle })
          .then((response): [string, Actor | 'unavailable'] => [
            handle,
            response.actor ?? 'unavailable',
          ])
          .catch((): [string, Actor | 'unavailable'] => [handle, 'unavailable']),
      ),
    ).then((entries) => {
      if (!cancelled) setResolved(new Map(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [context.api, actors]);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={theme.muted}>Top 8</Text>
      {actors.map((ref, index) => {
        const handle = ref.slice(1);
        const actor = resolved.get(handle.split('@')[0] ?? handle);
        if (actor === undefined) {
          return (
            <Text key={index} color={theme.muted}>
              {sanitizeForTerminal(ref)}
            </Text>
          );
        }
        if (actor === 'unavailable') {
          return (
            <Text key={index} color={theme.muted}>
              {sanitizeForTerminal(ref)} (unavailable)
            </Text>
          );
        }
        return (
          <Nameplate key={index} handle={actor.handle} nameplate={actor.nameplate ?? undefined} />
        );
      })}
    </Box>
  );
}

/** Actors who follow `context.ownerActorId` back — a mutual-follows list, populated via
 * `SocialGraphService.ListMutualFollows` (B-024). A public read (no `accessToken` — the
 * viewer may be signed out), same fetch-on-mount shape as `TopEightBlockView`. */
function FriendsBlockView({
  context,
  limit,
}: {
  context: PageRenderContext;
  limit: number;
}): ReactElement {
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'ready'; actors: readonly Actor[] } | { status: 'error' }
  >({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    context.api
      .listMutualFollows({ actorId: context.ownerActorId, cursor: '', limit })
      .then((response) => {
        if (!cancelled) setState({ status: 'ready', actors: response.actors });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [context.api, context.ownerActorId, limit]);

  if (state.status === 'loading') {
    return (
      <Box marginBottom={1}>
        <Text color={theme.muted}>Loading friends…</Text>
      </Box>
    );
  }
  if (state.status === 'error') {
    return (
      <Box marginBottom={1}>
        <Text color={theme.error}>Couldn't load friends.</Text>
      </Box>
    );
  }
  if (state.actors.length === 0) {
    return (
      <Box marginBottom={1}>
        <Text color={theme.muted}>No mutual follows yet.</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" marginBottom={1}>
      {state.actors.map((actor) => (
        <Nameplate key={actor.id} handle={actor.handle} nameplate={actor.nameplate ?? undefined} />
      ))}
    </Box>
  );
}

export interface GuestbookBlockHandle {
  refresh: () => void;
}

function GuestbookBlockView({
  context,
  limit,
}: {
  context: PageRenderContext;
  limit: number;
}): ReactElement {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'ready'; entries: readonly GuestbookEntry[] }
    | { status: 'error' }
  >({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    context.api
      .listGuestbook({ handle: context.handle, slug: context.slug, cursor: '', limit })
      .then((response) => {
        if (!cancelled) setState({ status: 'ready', entries: response.entries });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
    // `context.guestbookRefreshKey` is read only to re-trigger this fetch after
    // `PageScreen`'s `SignGuestbook` handler bumps it — deliberately in the deps array
    // even though its value is never otherwise used below.
  }, [context.api, context.handle, context.slug, limit, context.guestbookRefreshKey]);

  if (state.status === 'loading') {
    return (
      <Box marginBottom={1}>
        <Text color={theme.muted}>Loading guestbook…</Text>
      </Box>
    );
  }
  if (state.status === 'error') {
    return (
      <Box marginBottom={1}>
        <Text color={theme.error}>Couldn't load the guestbook.</Text>
      </Box>
    );
  }
  if (state.entries.length === 0) {
    return (
      <Box marginBottom={1}>
        <Text color={theme.muted}>No guestbook entries yet.</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" marginBottom={1}>
      {state.entries.map((entry) => (
        <Box key={entry.id} flexDirection="column" marginBottom={1}>
          <Box>
            {present(entry.author) ? (
              <Nameplate
                handle={entry.author.handle}
                nameplate={entry.author.nameplate ?? undefined}
              />
            ) : (
              <Text color={theme.muted}>a remote guest</Text>
            )}
            {guestbookWhen(entry) === '' ? null : (
              <Text color={theme.muted}> · {guestbookWhen(entry)}</Text>
            )}
          </Box>
          <Text wrap="wrap">{sanitizeForTerminal(entry.body)}</Text>
        </Box>
      ))}
    </Box>
  );
}

function guestbookWhen(entry: GuestbookEntry): string {
  const createdAt = toDate(entry.createdAt);
  return present(createdAt) ? formatRelativeTime(createdAt) : '';
}

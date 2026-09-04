import { type Actor, type GuestbookEntry, type Post } from '@patches/proto/es';
import type { RenderablePageBlock } from '@patches/domain';
import { useEffect, useState, type JSX } from 'react';
import { Image, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { api } from '../api/client.js';
import { PostRow } from './PostRow.js';
import { formatRelativeTime } from '../lib/format.js';
import { resolveMediaDownloadUrl } from '../media/upload.js';
import {
  guestbookEntryBody,
  toBlockViews,
  type LinkEntryView,
  type PageBlockView,
  type TopEightEntryView,
} from '../pages/view.js';

/** Everything a live block (Posts/TopEight/Guestbook) needs to fetch its own data —
 * mirrors the TUI's and web's identically-named context. The screen always provides it,
 * so unlike the web version there is no context-free placeholder path. */
export interface PageRenderContext {
  /** Page owner's local handle, no leading `@` (matches `GetPageRequest.handle`). */
  handle: string;
  /** The sub-page slug these blocks sit on — Guestbook entries are keyed by it. */
  slug: string;
  ownerActorId: string;
}

export interface PageBlocksProps {
  blocks: readonly RenderablePageBlock[];
  context: PageRenderContext;
}

/**
 * Renders a Patches Page's blocks (spec §170–172) read-only on React Native — inert data
 * only, never a webview. All mapping/sanitization decisions live in `src/pages/view.ts`
 * (tested there); this component only lays the viewmodel out and fetches the live blocks'
 * own data (Posts/TopEight/Guestbook), mirroring `apps/web`'s `PageBlocks` and the TUI's
 * `apps/tui/src/pages/render/blocks.tsx`. Unknown/unsupported blocks already arrive here
 * as placeholders — this component never crashes on one (§171).
 */
export function PageBlocks({ blocks, context }: PageBlocksProps): JSX.Element {
  return (
    <View>
      {toBlockViews(blocks).map((view, index) => (
        <View key={index} style={styles.block}>
          <BlockView view={view} context={context} />
        </View>
      ))}
    </View>
  );
}

function BlockView({
  view,
  context,
}: {
  view: PageBlockView;
  context: PageRenderContext;
}): JSX.Element {
  switch (view.kind) {
    case 'body':
      return <Text style={styles.body}>{view.text}</Text>;
    case 'ascii':
      return (
        <Text style={styles.ascii} selectable>
          {view.art}
        </Text>
      );
    case 'hero':
      return (
        <View>
          <Text style={styles.heroTitle}>{view.title}</Text>
          {view.subtitle === null ? null : <Text style={styles.muted}>{view.subtitle}</Text>}
        </View>
      );
    case 'nowPlaying':
      return <Text style={styles.muted}>{`♪ ${view.text}`}</Text>;
    case 'spacer':
      return <View style={{ height: view.height }} />;
    case 'image':
      return <ImageBlockView mediaId={view.mediaId} alt={view.alt} />;
    case 'links':
      return <LinksBlockView entries={view.entries} />;
    case 'posts':
      return <PostsBlockView ownerActorId={context.ownerActorId} limit={view.limit} />;
    case 'topEight':
      return <TopEightBlockView entries={view.entries} />;
    case 'guestbook':
      return <GuestbookBlockView handle={context.handle} slug={context.slug} limit={view.limit} />;
    case 'placeholder':
      return <Text style={styles.muted}>{view.label}</Text>;
    default:
      // Exhaustiveness guard — a future `PageBlockView` variant fails typecheck here.
      return viewNever(view);
  }
}

/** `Image` blocks carry only a Patches media id (§172: images in a Page MUST be Patches
 * media). Resolved to the R2 download URL via `GetMediaDownload` — the same RPC the web
 * `MediaImage` and TUI `MediaAttachments` use — and re-validated http(s)-only before it
 * reaches RN `Image`; anything else (failed fetch, non-http(s) URL) is a titled
 * placeholder, never a crash. */
function ImageBlockView({ mediaId, alt }: { mediaId: string; alt: string }): JSX.Element {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    resolveMediaDownloadUrl(api.media, mediaId)
      .then((resolvedUrl) => {
        if (cancelled) return;
        if (resolvedUrl === null) setFailed(true);
        else setUrl(resolvedUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [mediaId]);

  if (failed || url === null) {
    return (
      <View style={styles.imagePlaceholder}>
        <Text style={styles.muted}>{failed ? 'Image unavailable.' : 'Loading image…'}</Text>
      </View>
    );
  }
  return (
    <View>
      <Image source={{ uri: url }} style={styles.image} resizeMode="contain" />
      {alt === '' ? null : (
        <Text style={styles.imageAlt} numberOfLines={2}>
          {alt}
        </Text>
      )}
    </View>
  );
}

function LinksBlockView({ entries }: { entries: LinkEntryView[] }): JSX.Element {
  return (
    <View style={styles.linkList}>
      {entries.map((entry, index) => {
        const display = entry.label !== '' ? entry.label : entry.rawHref;
        const href = entry.href;
        if (href === null) {
          return (
            <Text key={index} style={styles.rejectedLink}>
              {`${display} (link removed — not an http(s) URL)`}
            </Text>
          );
        }
        return (
          <TouchableOpacity key={index} onPress={() => void openExternal(href)}>
            <Text style={styles.link}>{display}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** The href was already re-validated http(s)-only by `view.ts`; `Linking` hands it to the
 * OS. A rejection (no handler for the scheme, OS refusal) has nothing further a read-only
 * viewer can do. */
function openExternal(href: string): Promise<void> {
  return Linking.openURL(href).catch(() => {
    // OS couldn't open the URL — surfaced nowhere further by design.
  });
}

/** The owner's recent posts, one page of the same cursor-paginated actor feed the profile
 * surfaces use — chronological as the server returns it, never re-sorted client-side
 * (spec §46/Amendment B). Rendered via the shared `PostRow` with no action handlers —
 * this viewer is read-only. */
function PostsBlockView({
  ownerActorId,
  limit,
}: {
  ownerActorId: string;
  limit: number;
}): JSX.Element {
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'ready'; posts: Post[] } | { status: 'error' }
  >({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    api.feeds
      .listActorPosts({ actorId: ownerActorId, cursor: '', limit })
      .then((response) => {
        if (!cancelled) setState({ status: 'ready', posts: response.posts });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [ownerActorId, limit]);

  return (
    <View>
      <Text style={styles.blockTitle}>Posts</Text>
      <PostListState state={state} emptyLabel="No posts yet." errorLabel="Couldn't load posts." />
    </View>
  );
}

function PostListState({
  state,
  emptyLabel,
  errorLabel,
}: {
  state: { status: 'loading' } | { status: 'ready'; posts: Post[] } | { status: 'error' };
  emptyLabel: string;
  errorLabel: string;
}): JSX.Element {
  if (state.status === 'loading') return <Text style={styles.muted}>Loading…</Text>;
  if (state.status === 'error') return <Text style={styles.muted}>{errorLabel}</Text>;
  if (state.posts.length === 0) return <Text style={styles.muted}>{emptyLabel}</Text>;
  return (
    <View>
      {state.posts.map((post) => (
        <PostRow key={post.id} post={post} />
      ))}
    </View>
  );
}

/** Only a bare local `@handle` resolves (spec §174 — federation is a seam); remote or
 * unresolvable refs render as inert text, mirroring the TUI's `TopEightBlockView` and the
 * web renderer. */
function TopEightBlockView({ entries }: { entries: TopEightEntryView[] }): JSX.Element {
  const [resolved, setResolved] = useState<ReadonlyMap<string, Actor | null>>(new Map());

  useEffect(() => {
    let cancelled = false;
    const localHandles = entries
      .map((entry) => entry.localHandle)
      .filter((handle): handle is string => handle !== null);
    void Promise.all(
      localHandles.map((handle) =>
        api.actors
          .getActorByHandle({ handle })
          .then((response): [string, Actor | null] => [handle, response.actor ?? null])
          .catch((): [string, Actor | null] => [handle, null]),
      ),
    ).then((pairs) => {
      if (!cancelled) setResolved(new Map(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [entries]);

  return (
    <View>
      <Text style={styles.blockTitle}>Top 8</Text>
      {entries.map((entry, index) => {
        const actor = entry.localHandle === null ? undefined : resolved.get(entry.localHandle);
        if (actor !== undefined && actor !== null) {
          return (
            <View key={index} style={styles.actorRow}>
              <Text style={styles.actorName}>{actor.displayName || actor.handle}</Text>
              <Text style={styles.actorHandle}>@{actor.handle}</Text>
            </View>
          );
        }
        if (actor === null) {
          return <Text key={index} style={styles.muted}>{`${entry.ref} (unavailable)`}</Text>;
        }
        return (
          <Text key={index} style={styles.muted}>
            {entry.ref + (entry.localHandle === null ? ' (remote)' : '')}
          </Text>
        );
      })}
    </View>
  );
}

/** Guestbook entries, most-recent first as the server returns them (`ListGuestbook`) —
 * read-only on mobile (signing stays a TUI affordance, like the web). Bodies are
 * sanitized at render via `guestbookEntryBody`. */
function GuestbookBlockView({
  handle,
  slug,
  limit,
}: {
  handle: string;
  slug: string;
  limit: number;
}): JSX.Element {
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'ready'; entries: GuestbookEntry[] } | { status: 'error' }
  >({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    api.pages
      .listGuestbook({ handle, slug, cursor: '', limit })
      .then((response) => {
        if (!cancelled) setState({ status: 'ready', entries: response.entries });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [handle, slug, limit]);

  return (
    <View>
      <Text style={styles.blockTitle}>Guestbook</Text>
      {state.status === 'loading' ? <Text style={styles.muted}>Loading guestbook…</Text> : null}
      {state.status === 'error' ? (
        <Text style={styles.muted}>Couldn&apos;t load the guestbook.</Text>
      ) : null}
      {state.status === 'ready' && state.entries.length === 0 ? (
        <Text style={styles.muted}>No guestbook entries yet.</Text>
      ) : null}
      {state.status === 'ready'
        ? state.entries.map((entry) => (
            <View key={entry.id} style={styles.guestbookEntry}>
              <View style={styles.guestbookMeta}>
                <Text style={styles.guestbookAuthor}>
                  {entry.author
                    ? entry.author.displayName || `@${entry.author.handle}`
                    : 'a remote guest'}
                </Text>
                <Text style={styles.muted}>{formatRelativeTime(entry.createdAt)}</Text>
              </View>
              <Text style={styles.body}>{guestbookEntryBody(entry.body)}</Text>
            </View>
          ))
        : null}
    </View>
  );
}

function viewNever(view: never): JSX.Element {
  return <Text style={styles.muted}>{JSON.stringify(view)}</Text>;
}

const styles = StyleSheet.create({
  block: { marginBottom: 16 },
  body: { color: '#e5e5e5', fontSize: 15, lineHeight: 20 },
  ascii: { color: '#e5e5e5', fontFamily: 'monospace', fontSize: 12, lineHeight: 14 },
  heroTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  muted: { color: '#888' },
  blockTitle: { color: '#888', fontSize: 12, fontWeight: '700', marginBottom: 8 },
  image: { width: '100%', height: 220, borderRadius: 4, backgroundColor: '#161618' },
  imageAlt: { color: '#888', fontSize: 12, marginTop: 4 },
  imagePlaceholder: {
    padding: 24,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2a2a2c',
    borderRadius: 4,
  },
  linkList: { gap: 8 },
  link: { color: '#7c9cff', fontSize: 15 },
  rejectedLink: { color: '#666', fontSize: 15 },
  actorRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingVertical: 2 },
  actorName: { color: '#fff', fontWeight: '700' },
  actorHandle: { color: '#888' },
  guestbookEntry: {
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2a2a2c',
    gap: 4,
  },
  guestbookMeta: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  guestbookAuthor: { color: '#fff', fontWeight: '700', flexShrink: 1 },
});

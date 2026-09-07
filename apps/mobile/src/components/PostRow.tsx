import type { Post } from '@patches/proto/es';
import { useEffect, useState, type JSX } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { api } from '../api/client.js';
import { formatCount, formatRelativeTime } from '../lib/format.js';
import { safePageHref } from '../pages/href.js';
import { extractPostMediaViews } from '../posts/media.js';

export interface PostRowProps {
  post: Post;
  /** The signed-in actor's id, so "Edit" only ever shows on the viewer's own posts. */
  viewerActorId?: string;
  onReply?: (post: Post) => void;
  onQuote?: (post: Post) => void;
  onEdit?: (post: Post) => void;
  /** Open the author's Patches Page/wall — the mobile Pages viewer's entry point from a
   * timeline (B-082). Optional so contexts without a page stack render inert handles. */
  onOpenPage?: (handle: string) => void;
}

/**
 * One post in a timeline. A content warning is never a reveal-then-hide-again toggle for
 * the CW text itself (spec §185 — "content always renders"): the label always shows, and
 * only the body it's warning about starts hidden, matching `apps/web`'s `PostCard`
 * (`cwOpen` state). Reply/Quote/Edit are shown only when the caller wires a handler —
 * `HomeScreen` passes all three; `Edit` additionally requires `viewerActorId` to match
 * the post's author. Media attachments (B-084) are fetched via `GetMediaDownload` and
 * re-validated with `safePageHref`.
 */
export function PostRow({
  post,
  viewerActorId,
  onReply,
  onQuote,
  onEdit,
  onOpenPage,
}: PostRowProps): JSX.Element {
  const [cwOpen, setCwOpen] = useState(post.contentWarning === '');
  const isOwn = viewerActorId !== undefined && post.author?.id === viewerActorId;
  const authorHandle = post.author?.handle;

  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <Text style={styles.name} numberOfLines={1}>
          {post.author?.displayName || post.author?.handle}
        </Text>
        {onOpenPage !== undefined && authorHandle !== undefined ? (
          <TouchableOpacity
            onPress={() => onOpenPage(authorHandle)}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          >
            <Text style={styles.handleLink} numberOfLines={1}>
              @{authorHandle}
            </Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.handle} numberOfLines={1}>
            @{authorHandle}
          </Text>
        )}
        <Text style={styles.time}>{formatRelativeTime(post.createdAt)}</Text>
      </View>
      {post.contentWarning !== '' && !cwOpen ? (
        <TouchableOpacity onPress={() => setCwOpen(true)}>
          <Text style={styles.cw}>Content warning: {post.contentWarning} — tap to show</Text>
        </TouchableOpacity>
      ) : (
        <>
          {post.contentWarning !== '' ? (
            <Text style={styles.cw}>Content warning: {post.contentWarning}</Text>
          ) : null}
          {post.deleted ? (
            <Text style={styles.body}>This post was deleted.</Text>
          ) : (
            <>
              {post.body !== '' ? <Text style={styles.body}>{post.body}</Text> : null}
              <PostMediaAttachments post={post} />
            </>
          )}
        </>
      )}
      <View style={styles.counts}>
        <Text style={styles.count}>{formatCount(post.counts?.replies ?? 0)} replies</Text>
        <Text style={styles.count}>{formatCount(post.counts?.reposts ?? 0)} reposts</Text>
        <Text style={styles.count}>{formatCount(post.counts?.likes ?? 0)} likes</Text>
      </View>
      {onReply || onQuote || (onEdit && isOwn) ? (
        <View style={styles.actions}>
          {onReply ? (
            <TouchableOpacity onPress={() => onReply(post)}>
              <Text style={styles.action}>Reply</Text>
            </TouchableOpacity>
          ) : null}
          {onQuote ? (
            <TouchableOpacity onPress={() => onQuote(post)}>
              <Text style={styles.action}>Quote</Text>
            </TouchableOpacity>
          ) : null}
          {onEdit && isOwn ? (
            <TouchableOpacity onPress={() => onEdit(post)}>
              <Text style={styles.action}>Edit</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function PostMediaAttachments({ post }: { post: Post }): JSX.Element {
  const views = extractPostMediaViews(post);
  if (views.length === 0) return <></>;

  return (
    <View style={styles.mediaContainer}>
      {views.map((item) => (
        <PostMediaItem key={item.mediaId} mediaId={item.mediaId} altText={item.altText} />
      ))}
    </View>
  );
}

function PostMediaItem({ mediaId, altText }: { mediaId: string; altText: string }): JSX.Element {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.media
      .getMediaDownload({ mediaId })
      .then((response) => {
        if (cancelled) return;
        const safe = safePageHref(response.downloadUrl);
        if (safe === null) {
          setFailed(true);
          return;
        }
        setUrl(safe);
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
    <View style={styles.mediaCell}>
      <Image
        source={{ uri: url }}
        style={styles.image}
        resizeMode="contain"
        accessibilityLabel={altText || undefined}
      />
      {altText !== '' ? (
        <Text style={styles.imageAlt} numberOfLines={2}>
          {altText}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2c',
  },
  header: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 4 },
  name: { color: '#fff', fontWeight: '700', flexShrink: 1 },
  handle: { color: '#888', flexShrink: 1 },
  handleLink: { color: '#7c9cff', flexShrink: 1 },
  time: { color: '#666', marginLeft: 'auto' },
  cw: { color: '#e0b341', marginBottom: 4 },
  body: { color: '#e5e5e5', fontSize: 15, lineHeight: 20 },
  counts: { flexDirection: 'row', gap: 16, marginTop: 8 },
  count: { color: '#888', fontSize: 12 },
  actions: { flexDirection: 'row', gap: 20, marginTop: 8 },
  action: { color: '#7c9cff', fontSize: 13 },
  mediaContainer: { marginTop: 8, gap: 8 },
  mediaCell: { marginBottom: 4 },
  image: { width: '100%', height: 200, borderRadius: 6, backgroundColor: '#161618' },
  imageAlt: { color: '#888', fontSize: 12, marginTop: 2 },
  imagePlaceholder: {
    padding: 16,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2a2a2c',
    borderRadius: 6,
    marginVertical: 4,
  },
  muted: { color: '#888', fontSize: 12 },
});

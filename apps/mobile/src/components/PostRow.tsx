import type { MediaAttachment, Post } from '@patches/proto/es';
import { useEffect, useState, type JSX } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { api } from '../api/client.js';
import { formatCount, formatRelativeTime } from '../lib/format.js';
import { resolveMediaDownloadUrl } from '../media/attachment.js';

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
 * the post's author.
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
              <Text style={styles.body}>{post.body}</Text>
              {post.media.length > 0 ? (
                <PostMediaAttachmentsView attachments={post.media} />
              ) : null}
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

function PostMediaAttachmentsView({
  attachments,
}: {
  attachments: readonly MediaAttachment[];
}): JSX.Element {
  return (
    <View style={styles.mediaContainer}>
      {attachments.map((attachment) => (
        <PostMediaImage key={attachment.mediaId} attachment={attachment} />
      ))}
    </View>
  );
}

function PostMediaImage({ attachment }: { attachment: MediaAttachment }): JSX.Element {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void resolveMediaDownloadUrl({
      mediaId: attachment.mediaId,
      getMediaDownload: (req) => api.media.getMediaDownload(req),
    }).then((resolvedUrl) => {
      if (cancelled) return;
      if (resolvedUrl === null) {
        setFailed(true);
      } else {
        setUrl(resolvedUrl);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [attachment.mediaId]);

  if (failed || url === null) {
    return (
      <View style={styles.mediaPlaceholder}>
        <Text style={styles.muted}>{failed ? 'Image unavailable.' : 'Loading image…'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.mediaItem}>
      <Image source={{ uri: url }} style={styles.mediaImage} resizeMode="cover" />
      {attachment.altText !== '' ? (
        <Text style={styles.mediaAlt} numberOfLines={2}>
          {attachment.altText}
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
  mediaItem: { borderRadius: 8, overflow: 'hidden', backgroundColor: '#161618' },
  mediaImage: { width: '100%', height: 200, borderRadius: 8 },
  mediaAlt: { color: '#888', fontSize: 12, marginTop: 4, paddingHorizontal: 4 },
  mediaPlaceholder: {
    padding: 16,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2a2a2c',
    borderRadius: 8,
    marginTop: 8,
  },
  muted: { color: '#888', fontSize: 12 },
});

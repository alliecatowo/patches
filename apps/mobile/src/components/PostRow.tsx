import type { Post } from '@patches/proto/es';
import { useState, type JSX } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { formatCount, formatRelativeTime } from '../lib/format.js';

export interface PostRowProps {
  post: Post;
  /** The signed-in actor's id, so "Edit" only ever shows on the viewer's own posts. */
  viewerActorId?: string;
  onReply?: (post: Post) => void;
  onQuote?: (post: Post) => void;
  onEdit?: (post: Post) => void;
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
}: PostRowProps): JSX.Element {
  const [cwOpen, setCwOpen] = useState(post.contentWarning === '');
  const isOwn = viewerActorId !== undefined && post.author?.id === viewerActorId;

  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <Text style={styles.name} numberOfLines={1}>
          {post.author?.displayName || post.author?.handle}
        </Text>
        <Text style={styles.handle} numberOfLines={1}>
          @{post.author?.handle}
        </Text>
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
            <Text style={styles.body}>{post.body}</Text>
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
  time: { color: '#666', marginLeft: 'auto' },
  cw: { color: '#e0b341', marginBottom: 4 },
  body: { color: '#e5e5e5', fontSize: 15, lineHeight: 20 },
  counts: { flexDirection: 'row', gap: 16, marginTop: 8 },
  count: { color: '#888', fontSize: 12 },
  actions: { flexDirection: 'row', gap: 20, marginTop: 8 },
  action: { color: '#7c9cff', fontSize: 13 },
});

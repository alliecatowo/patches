import type { Post } from '@patches/proto/es';
import type { JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatCount, formatRelativeTime } from '../lib/format.js';

export interface PostRowProps {
  post: Post;
}

/**
 * One post in a timeline. Display-only for this slice (no like/repost/bookmark actions —
 * out of scope, task brief covers auth/timelines/compose/notifications only). A content
 * warning is shown as a label above the body rather than a reveal toggle (unlike
 * `apps/web`'s `PostCard`) to keep this slice small; the body is never hidden.
 */
export function PostRow({ post }: PostRowProps): JSX.Element {
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
      {post.contentWarning !== '' ? (
        <Text style={styles.cw}>Content warning: {post.contentWarning}</Text>
      ) : null}
      {post.deleted ? (
        <Text style={styles.body}>This post was deleted.</Text>
      ) : (
        <Text style={styles.body}>{post.body}</Text>
      )}
      <View style={styles.counts}>
        <Text style={styles.count}>{formatCount(post.counts?.replies ?? 0)} replies</Text>
        <Text style={styles.count}>{formatCount(post.counts?.reposts ?? 0)} reposts</Text>
        <Text style={styles.count}>{formatCount(post.counts?.likes ?? 0)} likes</Text>
      </View>
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
});

import type { MediaAttachment } from '@patches/proto/es';
import { useEffect, useState, type JSX } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { api } from '../api/client.js';
import { resolveMediaDownloadUrl } from '../media/attachment.js';

export interface PostMediaAttachmentsProps {
  media: readonly MediaAttachment[];
}

export function PostMediaAttachments({ media }: PostMediaAttachmentsProps): JSX.Element | null {
  if (!media || media.length === 0) return null;

  return (
    <View style={styles.container}>
      {media.map((item) => (
        <PostMediaItem key={item.mediaId} item={item} />
      ))}
    </View>
  );
}

function PostMediaItem({ item }: { item: MediaAttachment }): JSX.Element {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    resolveMediaDownloadUrl(api.media, item.mediaId)
      .then((resolvedUrl) => {
        if (cancelled) return;
        if (resolvedUrl === null) {
          setFailed(true);
        } else {
          setUrl(resolvedUrl);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [item.mediaId]);

  if (failed || url === null) {
    return (
      <View style={styles.imagePlaceholder}>
        <Text style={styles.muted}>{failed ? 'Image unavailable.' : 'Loading image…'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.item}>
      <Image source={{ uri: url }} style={styles.image} resizeMode="cover" />
      {item.altText !== '' ? (
        <Text style={styles.altText} numberOfLines={2}>
          {item.altText}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 8, gap: 8 },
  item: { borderRadius: 6, overflow: 'hidden' },
  image: { width: '100%', height: 200, borderRadius: 6, backgroundColor: '#161618' },
  altText: { color: '#888', fontSize: 12, marginTop: 4 },
  imagePlaceholder: {
    padding: 20,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2a2a2c',
    borderRadius: 6,
    backgroundColor: '#161618',
  },
  muted: { color: '#888', fontSize: 13 },
});

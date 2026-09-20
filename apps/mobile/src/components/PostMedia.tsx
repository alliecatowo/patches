import type { MediaAttachment } from '@patches/proto/es';
import { useEffect, useState, type JSX } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { api } from '../api/client.js';
import { safePageHref } from '../pages/href.js';
import { toPostMediaItems, type PostMediaItem } from '../media/postMedia.js';

export interface PostMediaProps {
  media: readonly MediaAttachment[] | undefined;
}

/**
 * Renders attached media images for a post in React Native timelines (spec §28, §172, B-084).
 * Fetches download URLs via `MediaService.GetMediaDownload` and validates URLs with `safePageHref`.
 */
export function PostMedia({ media }: PostMediaProps): JSX.Element | null {
  const items = toPostMediaItems(media);

  if (items.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {items.map((item) => (
        <PostMediaImage key={item.mediaId} item={item} />
      ))}
    </View>
  );
}

function PostMediaImage({ item }: { item: PostMediaItem }): JSX.Element {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.media
      .getMediaDownload({ mediaId: item.mediaId })
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
  }, [item.mediaId]);

  if (failed || url === null) {
    return (
      <View style={styles.imagePlaceholder}>
        <Text style={styles.muted}>{failed ? 'Image unavailable.' : 'Loading image…'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.imageWrapper}>
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
  container: {
    marginTop: 8,
    gap: 8,
  },
  imageWrapper: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#161618',
  },
  image: {
    width: '100%',
    height: 200,
  },
  altText: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  imagePlaceholder: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2a2a2c',
    borderRadius: 8,
    backgroundColor: '#161618',
  },
  muted: {
    color: '#888',
    fontSize: 13,
  },
});

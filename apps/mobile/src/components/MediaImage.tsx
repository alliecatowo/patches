import { useEffect, useState, type JSX } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { api } from '../api/client.js';
import { resolveMediaUrl } from '../media/image.js';

export interface MediaImageProps {
  mediaId: string;
  altText?: string;
}

/**
 * Resolves a post's `MediaAttachment.mediaId` to a download URL via `GetMediaDownload`
 * and renders a React Native `<Image>` element.
 * Safe http(s)-only URLs are enforced via `resolveMediaUrl`.
 * Renders a placeholder view during loading or if download URL resolution fails.
 */
export function MediaImage({ mediaId, altText }: MediaImageProps): JSX.Element {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setUrl(null);

    resolveMediaUrl(api.media, mediaId)
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
  }, [mediaId]);

  if (failed || url === null) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.muted}>{failed ? 'Image unavailable' : 'Loading image…'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Image
        source={{ uri: url }}
        style={styles.image}
        resizeMode="cover"
        accessibilityLabel={altText || 'Post attachment'}
      />
      {altText ? (
        <Text style={styles.altText} numberOfLines={2}>
          {altText}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#161618',
  },
  image: {
    width: '100%',
    height: 200,
  },
  placeholder: {
    marginTop: 8,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2a2a2c',
    borderRadius: 6,
    backgroundColor: '#161618',
  },
  muted: {
    color: '#888',
    fontSize: 13,
  },
  altText: {
    color: '#888',
    fontSize: 12,
    padding: 6,
  },
});

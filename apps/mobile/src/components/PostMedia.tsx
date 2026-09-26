import type { MediaAttachment } from '@patches/proto/es';
import { useEffect, useState, type JSX } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { api } from '../api/client.js';
import { formatMediaAltText, getSafeMediaUrl, sortMediaAttachments } from '../lib/postMedia.js';

export interface PostMediaProps {
  media: readonly MediaAttachment[];
}

/**
 * Renders post image media attachments (spec §28, B-084).
 * Fetches presigned download URLs via `api.media.getMediaDownload`, validates the URL with
 * `getSafeMediaUrl`, and renders `Image` with optional alt text caption.
 */
export function PostMedia({ media }: PostMediaProps): JSX.Element | null {
  const sorted = sortMediaAttachments(media);
  if (sorted.length === 0) return null;

  return (
    <View style={styles.container}>
      {sorted.map((item) => (
        <PostMediaItem key={item.mediaId || item.position} attachment={item} />
      ))}
    </View>
  );
}

function PostMediaItem({ attachment }: { attachment: MediaAttachment }): JSX.Element {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!attachment.mediaId) {
      setFailed(true);
      return;
    }
    api.media
      .getMediaDownload({ mediaId: attachment.mediaId })
      .then((response) => {
        if (cancelled) return;
        const safe = getSafeMediaUrl(response.downloadUrl);
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
  }, [attachment.mediaId]);

  if (failed || url === null) {
    return (
      <View style={styles.imagePlaceholder}>
        <Text style={styles.muted}>{failed ? 'Image unavailable.' : 'Loading image…'}</Text>
      </View>
    );
  }

  const alt = formatMediaAltText(attachment.altText);

  return (
    <View style={styles.item}>
      <Image source={{ uri: url }} style={styles.image} resizeMode="cover" />
      {alt !== '' ? (
        <Text style={styles.altText} numberOfLines={2}>
          {alt}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 8, gap: 8 },
  item: { marginBottom: 4 },
  image: { width: '100%', height: 200, borderRadius: 8, backgroundColor: '#161618' },
  altText: { color: '#888', fontSize: 12, marginTop: 4 },
  imagePlaceholder: {
    padding: 16,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2a2a2c',
    borderRadius: 8,
    marginVertical: 4,
  },
  muted: { color: '#888', fontSize: 13 },
});

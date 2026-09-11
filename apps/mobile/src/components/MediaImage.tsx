import { useEffect, useState, type JSX } from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle, type ImageStyle } from 'react-native';

import { api } from '../api/client.js';
import { safePageHref } from '../pages/href.js';

export interface MediaImageProps {
  mediaId: string;
  altText?: string;
  containerStyle?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
}

export function MediaImage({
  mediaId,
  altText = '',
  containerStyle,
  imageStyle,
}: MediaImageProps): JSX.Element {
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
      <View style={[styles.placeholder, containerStyle]}>
        <Text style={styles.muted}>{failed ? 'Image unavailable.' : 'Loading image…'}</Text>
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      <Image
        source={{ uri: url }}
        style={[styles.image, imageStyle]}
        resizeMode="cover"
        accessibilityLabel={altText}
      />
      {altText !== '' ? (
        <Text style={styles.altText} numberOfLines={2}>
          {altText}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2a2a2c',
    borderRadius: 8,
    backgroundColor: '#161618',
  },
  muted: { color: '#888', fontSize: 13 },
  image: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    backgroundColor: '#161618',
  },
  altText: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
});

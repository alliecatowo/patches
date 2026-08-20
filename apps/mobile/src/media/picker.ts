import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import type { LocalImage } from './upload.js';

/** `null` means the user backed out of the system picker (cancel, no photo library
 * permission) — never an error the caller should surface as a failure. */
export type PickedImage = LocalImage | null;

/**
 * Opens the platform photo library picker and reads the chosen image's bytes off disk.
 * `expo-image-picker`'s `ImagePickerAsset.uri` is a local `file://` URI on iOS/Android
 * (never uploaded bytes itself — spec §153's "never proxy through Node" is about the
 * server, not this local read), so `expo-file-system`'s `File#arrayBuffer()` is the
 * documented way to get raw bytes for the direct-to-R2 PUT in `media/upload.ts`.
 */
export async function pickImage(): Promise<PickedImage> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo library access was not granted.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    allowsMultipleSelection: false,
  });
  if (result.canceled || result.assets.length === 0) return null;

  const asset = result.assets[0];
  if (asset === undefined) return null;
  const file = new File(asset.uri);
  const buffer = await file.arrayBuffer();
  return { bytes: new Uint8Array(buffer), mimeType: asset.mimeType ?? 'image/jpeg' };
}

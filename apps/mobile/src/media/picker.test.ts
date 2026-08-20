import { beforeEach, describe, expect, it, vi } from 'vitest';

interface FakePermission {
  granted: boolean;
}

interface FakeAsset {
  uri: string;
  mimeType?: string;
}

interface FakePickerResult {
  canceled: boolean;
  assets: FakeAsset[];
}

const requestMediaLibraryPermissionsAsync = vi.fn<() => Promise<FakePermission>>();
const launchImageLibraryAsync = vi.fn<() => Promise<FakePickerResult>>();

// Hoisted above the imports below by vitest, so the real native modules (unavailable
// under Vitest's `node` environment) never load — mirrors `credentialStore.test.ts`'s
// `vi.mock('expo-secure-store', ...)` pattern.
vi.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: () => requestMediaLibraryPermissionsAsync(),
  launchImageLibraryAsync: () => launchImageLibraryAsync(),
}));

const arrayBuffer = vi.fn<() => Promise<ArrayBuffer>>();
vi.mock('expo-file-system', () => ({
  File: class {
    constructor(public uri: string) {}
    arrayBuffer(): Promise<ArrayBuffer> {
      return arrayBuffer();
    }
  },
}));

import { pickImage } from './picker.js';

describe('pickImage', () => {
  beforeEach(() => {
    requestMediaLibraryPermissionsAsync.mockReset();
    launchImageLibraryAsync.mockReset();
    arrayBuffer.mockReset();
  });

  it('throws when the user denies photo library access', async () => {
    requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false });
    await expect(pickImage()).rejects.toThrow('Photo library access was not granted.');
    expect(launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  it('returns null when the user cancels the picker', async () => {
    requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
    launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: [] });
    await expect(pickImage()).resolves.toBeNull();
  });

  it('reads the picked asset off disk and returns its bytes/mimeType', async () => {
    requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
    launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///tmp/photo.jpg', mimeType: 'image/jpeg' }],
    });
    arrayBuffer.mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);

    const picked = await pickImage();
    expect(picked).not.toBeNull();
    expect(picked?.mimeType).toBe('image/jpeg');
    expect(Array.from(picked?.bytes ?? [])).toEqual([1, 2, 3]);
  });

  it('falls back to image/jpeg when the asset has no mimeType', async () => {
    requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
    launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///tmp/photo' }],
    });
    arrayBuffer.mockResolvedValue(new Uint8Array([1]).buffer);

    const picked = await pickImage();
    expect(picked?.mimeType).toBe('image/jpeg');
  });
});

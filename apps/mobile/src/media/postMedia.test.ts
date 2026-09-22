import { create } from '@bufbuild/protobuf';
import { GetMediaDownloadResponseSchema, MediaAttachmentSchema } from '@patches/proto/es';
import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(() => Promise.resolve(null)),
  setItemAsync: vi.fn(() => Promise.resolve()),
  deleteItemAsync: vi.fn(() => Promise.resolve()),
}));

import { api } from '../api/client.js';
import { resolveMediaAttachmentUrl } from './postMedia.js';

describe('resolveMediaAttachmentUrl', () => {
  it('returns null if attachment has an empty mediaId', async () => {
    const attachment = create(MediaAttachmentSchema, { mediaId: '', altText: 'Test' });
    const res = await resolveMediaAttachmentUrl(attachment);
    expect(res).toBeNull();
  });

  it('resolves and validates safe http/https download URLs', async () => {
    const attachment = create(MediaAttachmentSchema, {
      mediaId: 'media-100',
      altText: 'Sample photo',
    });
    vi.spyOn(api.media, 'getMediaDownload').mockResolvedValueOnce(
      create(GetMediaDownloadResponseSchema, {
        mediaId: 'media-100',
        downloadUrl: 'https://cdn.example.com/images/sample.jpg',
      }),
    );

    const res = await resolveMediaAttachmentUrl(attachment);
    expect(res).toEqual({
      mediaId: 'media-100',
      altText: 'Sample photo',
      url: 'https://cdn.example.com/images/sample.jpg',
    });
  });

  it('rejects unsafe non-http(s) download URLs', async () => {
    const attachment = create(MediaAttachmentSchema, {
      mediaId: 'media-101',
      altText: 'Unsafe link',
    });
    vi.spyOn(api.media, 'getMediaDownload').mockResolvedValueOnce(
      create(GetMediaDownloadResponseSchema, {
        mediaId: 'media-101',
        downloadUrl: 'javascript:alert(1)',
      }),
    );

    const res = await resolveMediaAttachmentUrl(attachment);
    expect(res).toBeNull();
  });

  it('returns null on API request failure', async () => {
    const attachment = create(MediaAttachmentSchema, {
      mediaId: 'media-102',
      altText: 'Error case',
    });
    vi.spyOn(api.media, 'getMediaDownload').mockRejectedValueOnce(new Error('Network error'));

    const res = await resolveMediaAttachmentUrl(attachment);
    expect(res).toBeNull();
  });
});

import { create } from '@bufbuild/protobuf';
import {
  MediaAttachmentSchema,
  PostSchema,
  type GetMediaDownloadResponse,
} from '@patches/proto/es';
import type { PatchesApi } from '@patches/client';
import { describe, expect, it, vi } from 'vitest';

import { getPostMediaAttachments, resolveMediaUrl } from './download.js';

type MediaClient = PatchesApi['media'];

describe('getPostMediaAttachments', () => {
  it('returns empty array when post media is undefined or empty', () => {
    const post = create(PostSchema, { id: 'post-1' });
    expect(getPostMediaAttachments(post)).toEqual([]);
  });

  it('returns media attachments for a normal post', () => {
    const attachment1 = create(MediaAttachmentSchema, {
      mediaId: 'm1',
      altText: 'Alt 1',
    });
    const attachment2 = create(MediaAttachmentSchema, {
      mediaId: 'm2',
      altText: 'Alt 2',
    });
    const post = create(PostSchema, {
      id: 'post-1',
      media: [attachment1, attachment2],
    });

    expect(getPostMediaAttachments(post)).toEqual([attachment1, attachment2]);
  });

  it('returns empty array when post is marked deleted', () => {
    const attachment = create(MediaAttachmentSchema, { mediaId: 'm1' });
    const post = create(PostSchema, {
      id: 'post-1',
      deleted: true,
      media: [attachment],
    });

    expect(getPostMediaAttachments(post)).toEqual([]);
  });
});

describe('resolveMediaUrl', () => {
  it('returns safe HTTP/HTTPS URL when GetMediaDownload succeeds', async () => {
    const getMediaDownload = vi.fn<() => Promise<GetMediaDownloadResponse>>(() =>
      Promise.resolve({
        downloadUrl: 'https://r2.example.com/images/m1.png',
      } as GetMediaDownloadResponse),
    );
    const mediaClient = { getMediaDownload } as unknown as MediaClient;

    const url = await resolveMediaUrl(mediaClient, 'm1');
    expect(url).toBe('https://r2.example.com/images/m1.png');
    expect(getMediaDownload).toHaveBeenCalledWith({ mediaId: 'm1' });
  });

  it('returns null when GetMediaDownload returns unsafe or non-HTTP scheme', async () => {
    const getMediaDownload = vi.fn<() => Promise<GetMediaDownloadResponse>>(() =>
      Promise.resolve({
        downloadUrl: 'file:///etc/passwd',
      } as GetMediaDownloadResponse),
    );
    const mediaClient = { getMediaDownload } as unknown as MediaClient;

    const url = await resolveMediaUrl(mediaClient, 'm1');
    expect(url).toBeNull();
  });

  it('returns null when GetMediaDownload returns empty downloadUrl', async () => {
    const getMediaDownload = vi.fn<() => Promise<GetMediaDownloadResponse>>(() =>
      Promise.resolve({ downloadUrl: '' } as GetMediaDownloadResponse),
    );
    const mediaClient = { getMediaDownload } as unknown as MediaClient;

    const url = await resolveMediaUrl(mediaClient, 'm1');
    expect(url).toBeNull();
  });

  it('returns null when GetMediaDownload throws an error', async () => {
    const getMediaDownload = vi.fn<() => Promise<GetMediaDownloadResponse>>(() =>
      Promise.reject(new Error('Network error')),
    );
    const mediaClient = { getMediaDownload } as unknown as MediaClient;

    const url = await resolveMediaUrl(mediaClient, 'm1');
    expect(url).toBeNull();
  });
});

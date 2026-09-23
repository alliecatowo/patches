import type { GetMediaDownloadResponse, MediaAttachment } from '@patches/proto/es';
import { describe, expect, it, vi } from 'vitest';

import { resolveMediaAttachment, resolveMediaAttachments } from './attachment.js';

describe('resolveMediaAttachment', () => {
  it('returns safe download URL for valid http(s) response', async () => {
    const attachment: MediaAttachment = {
      mediaId: 'm1',
      altText: 'A cute cat',
      width: 800,
      height: 600,
      mimeType: 'image/jpeg',
      position: 0,
      $typeName: 'patches.v1.MediaAttachment',
    };

    const getMediaDownload = vi.fn<() => Promise<GetMediaDownloadResponse>>(() =>
      Promise.resolve({
        downloadUrl: 'https://cdn.example.com/m1.jpg',
      } as GetMediaDownloadResponse),
    );

    const resolved = await resolveMediaAttachment(attachment, getMediaDownload);

    expect(resolved).toEqual({
      mediaId: 'm1',
      altText: 'A cute cat',
      url: 'https://cdn.example.com/m1.jpg',
      width: 800,
      height: 600,
    });
  });

  it('returns url: null for failed RPC request', async () => {
    const attachment: MediaAttachment = {
      mediaId: 'm1',
      altText: 'A cute cat',
      width: 800,
      height: 600,
      mimeType: 'image/jpeg',
      position: 0,
      $typeName: 'patches.v1.MediaAttachment',
    };

    const getMediaDownload = vi.fn<() => Promise<GetMediaDownloadResponse>>(() =>
      Promise.reject(new Error('Network error')),
    );

    const resolved = await resolveMediaAttachment(attachment, getMediaDownload);

    expect(resolved).toEqual({
      mediaId: 'm1',
      altText: 'A cute cat',
      url: null,
      width: 800,
      height: 600,
    });
  });

  it('returns url: null for unsafe non-http(s) download URL', async () => {
    const attachment: MediaAttachment = {
      mediaId: 'm1',
      altText: 'A cute cat',
      width: 800,
      height: 600,
      mimeType: 'image/jpeg',
      position: 0,
      $typeName: 'patches.v1.MediaAttachment',
    };

    const getMediaDownload = vi.fn<() => Promise<GetMediaDownloadResponse>>(() =>
      Promise.resolve({
        downloadUrl: 'javascript:alert(1)',
      } as GetMediaDownloadResponse),
    );

    const resolved = await resolveMediaAttachment(attachment, getMediaDownload);

    expect(resolved).toEqual({
      mediaId: 'm1',
      altText: 'A cute cat',
      url: null,
      width: 800,
      height: 600,
    });
  });
});

describe('resolveMediaAttachments', () => {
  it('returns empty array when given empty attachments', async () => {
    const getMediaDownload = vi.fn();
    const resolved = await resolveMediaAttachments([], getMediaDownload);
    expect(resolved).toEqual([]);
    expect(getMediaDownload).not.toHaveBeenCalled();
  });

  it('resolves multiple attachments in parallel', async () => {
    const attachments: MediaAttachment[] = [
      {
        mediaId: 'm1',
        altText: 'Image 1',
        width: 100,
        height: 100,
        mimeType: 'image/png',
        position: 0,
        $typeName: 'patches.v1.MediaAttachment',
      },
      {
        mediaId: 'm2',
        altText: 'Image 2',
        width: 200,
        height: 200,
        mimeType: 'image/png',
        position: 1,
        $typeName: 'patches.v1.MediaAttachment',
      },
    ];

    const getMediaDownload = vi.fn<({ mediaId }: { mediaId: string }) => Promise<GetMediaDownloadResponse>>(
      ({ mediaId }) =>
        Promise.resolve({
          downloadUrl: `https://cdn.example.com/${mediaId}.png`,
        } as GetMediaDownloadResponse),
    );

    const resolved = await resolveMediaAttachments(attachments, getMediaDownload);

    expect(resolved).toEqual([
      {
        mediaId: 'm1',
        altText: 'Image 1',
        url: 'https://cdn.example.com/m1.png',
        width: 100,
        height: 100,
      },
      {
        mediaId: 'm2',
        altText: 'Image 2',
        url: 'https://cdn.example.com/m2.png',
        width: 200,
        height: 200,
      },
    ]);
  });
});

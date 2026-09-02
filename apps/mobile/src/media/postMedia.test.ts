import { MediaAttachmentSchema } from '@patches/proto/es';
import { create } from '@bufbuild/protobuf';
import { describe, expect, it, vi } from 'vitest';

import { resolvePostMediaAttachments } from './postMedia.js';

describe('resolvePostMediaAttachments', () => {
  it('returns empty array when given no attachments', async () => {
    const mockGetMediaDownload = vi.fn();
    const results = await resolvePostMediaAttachments([], mockGetMediaDownload);
    expect(results).toEqual([]);
  });

  it('resolves valid download URLs', async () => {
    const att = create(MediaAttachmentSchema, {
      mediaId: 'media-123',
      altText: 'A cute cat',
    });

    const mockGetMediaDownload = vi.fn().mockResolvedValue({
      downloadUrl: 'https://r2.example.com/media-123.png',
    });

    const results = await resolvePostMediaAttachments([att], mockGetMediaDownload);

    expect(mockGetMediaDownload).toHaveBeenCalledWith({ mediaId: 'media-123' });
    expect(results).toEqual([
      {
        mediaId: 'media-123',
        altText: 'A cute cat',
        url: 'https://r2.example.com/media-123.png',
        failed: false,
      },
    ]);
  });

  it('marks non-http/https or malformed URLs as failed', async () => {
    const att1 = create(MediaAttachmentSchema, {
      mediaId: 'media-bad-scheme',
      altText: 'Javascript scheme',
    });
    const att2 = create(MediaAttachmentSchema, {
      mediaId: 'media-control-chars',
      altText: 'Control character',
    });

    const mockGetMediaDownload = vi
      .fn()
      .mockResolvedValueOnce({ downloadUrl: 'javascript:alert(1)' })
      .mockResolvedValueOnce({ downloadUrl: 'https://r2.example.com/\x1b[31mred.png' });

    const results = await resolvePostMediaAttachments([att1, att2], mockGetMediaDownload);

    expect(results).toEqual([
      {
        mediaId: 'media-bad-scheme',
        altText: 'Javascript scheme',
        url: null,
        failed: true,
      },
      {
        mediaId: 'media-control-chars',
        altText: 'Control character',
        url: null,
        failed: true,
      },
    ]);
  });

  it('handles API rejection gracefully', async () => {
    const att = create(MediaAttachmentSchema, {
      mediaId: 'media-error',
      altText: 'Failing fetch',
    });

    const mockGetMediaDownload = vi.fn().mockRejectedValue(new Error('Network error'));

    const results = await resolvePostMediaAttachments([att], mockGetMediaDownload);

    expect(results).toEqual([
      {
        mediaId: 'media-error',
        altText: 'Failing fetch',
        url: null,
        failed: true,
      },
    ]);
  });
});

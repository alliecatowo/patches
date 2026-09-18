import { create } from '@bufbuild/protobuf';
import { MediaAttachmentSchema } from '@patches/proto/es';
import { describe, expect, it, vi } from 'vitest';

import { hasMediaAttachments, resolveMediaDownloadUrl } from './attachment.js';

describe('resolveMediaDownloadUrl', () => {
  it('resolves valid http and https URLs', async () => {
    const fetcher = vi.fn().mockResolvedValue('https://r2.example.com/media/123.jpg');
    const result = await resolveMediaDownloadUrl('m-123', fetcher);
    expect(result).toBe('https://r2.example.com/media/123.jpg');
    expect(fetcher).toHaveBeenCalledWith('m-123');

    const httpFetcher = vi.fn().mockResolvedValue('http://localhost:8080/media/123.jpg');
    const httpResult = await resolveMediaDownloadUrl('m-456', httpFetcher);
    expect(httpResult).toBe('http://localhost:8080/media/123.jpg');
  });

  it('returns null for unsafe schemes or malformed URLs', async () => {
    const jsFetcher = vi.fn().mockResolvedValue('javascript:alert(1)');
    expect(await resolveMediaDownloadUrl('m-js', jsFetcher)).toBeNull();

    const fileFetcher = vi.fn().mockResolvedValue('file:///etc/passwd');
    expect(await resolveMediaDownloadUrl('m-file', fileFetcher)).toBeNull();

    const malformedFetcher = vi.fn().mockResolvedValue('not a url');
    expect(await resolveMediaDownloadUrl('m-bad', malformedFetcher)).toBeNull();

    const controlFetcher = vi.fn().mockResolvedValue('https://example.com/a\x01b');
    expect(await resolveMediaDownloadUrl('m-ctrl', controlFetcher)).toBeNull();
  });

  it('returns null when the download fetcher rejects', async () => {
    const errorFetcher = vi.fn().mockRejectedValue(new Error('Network error'));
    const result = await resolveMediaDownloadUrl('m-err', errorFetcher);
    expect(result).toBeNull();
  });

  it('returns null for empty or whitespace media ids', async () => {
    const fetcher = vi.fn();
    expect(await resolveMediaDownloadUrl('', fetcher)).toBeNull();
    expect(await resolveMediaDownloadUrl('   ', fetcher)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('hasMediaAttachments', () => {
  it('returns false for undefined, null, or empty media lists', () => {
    expect(hasMediaAttachments(undefined)).toBe(false);
    expect(hasMediaAttachments(null)).toBe(false);
    expect(hasMediaAttachments([])).toBe(false);
  });

  it('returns true when media list is non-empty', () => {
    const attachment = create(MediaAttachmentSchema, {
      mediaId: 'med-1',
      altText: 'A sample photo',
    });
    expect(hasMediaAttachments([attachment])).toBe(true);
  });
});

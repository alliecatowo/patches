import type { GetMediaDownloadRequest, GetMediaDownloadResponse } from '@patches/proto/es';
import type { PatchesApi } from '@patches/client';
import { describe, expect, it } from 'vitest';

import { resolveMediaDownloadUrl } from './attachment.js';

type MediaClient = Pick<PatchesApi['media'], 'getMediaDownload'>;

function fakeMediaClient(
  getMediaDownload?: (req: Partial<GetMediaDownloadRequest>) => Promise<GetMediaDownloadResponse>,
): MediaClient {
  return {
    getMediaDownload:
      getMediaDownload ??
      (() => Promise.reject(new Error('getMediaDownload not stubbed'))),
  };
}

describe('resolveMediaDownloadUrl', () => {
  it('returns safe http/https download URL when getMediaDownload succeeds', async () => {
    const client = fakeMediaClient(({ mediaId }) =>
      Promise.resolve({
        downloadUrl: `https://r2.example.com/media/${mediaId ?? ''}.png`,
      } as GetMediaDownloadResponse),
    );

    const result = await resolveMediaDownloadUrl(client, 'media-123');
    expect(result).toBe('https://r2.example.com/media/media-123.png');
  });

  it('returns null when downloadUrl is missing or empty', async () => {
    const client = fakeMediaClient(() =>
      Promise.resolve({
        downloadUrl: '',
      } as GetMediaDownloadResponse),
    );

    const result = await resolveMediaDownloadUrl(client, 'media-123');
    expect(result).toBeNull();
  });

  it('returns null when mediaId is empty', async () => {
    const client = fakeMediaClient();

    const result = await resolveMediaDownloadUrl(client, '');
    expect(result).toBeNull();
  });

  it('returns null when downloadUrl is unsafe (javascript, file, control chars)', async () => {
    const javascriptClient = fakeMediaClient(() =>
      Promise.resolve({
        downloadUrl: 'javascript:alert(1)',
      } as GetMediaDownloadResponse),
    );

    expect(await resolveMediaDownloadUrl(javascriptClient, 'm1')).toBeNull();

    const fileClient = fakeMediaClient(() =>
      Promise.resolve({
        downloadUrl: 'file:///etc/passwd',
      } as GetMediaDownloadResponse),
    );

    expect(await resolveMediaDownloadUrl(fileClient, 'm1')).toBeNull();

    const controlCharClient = fakeMediaClient(() =>
      Promise.resolve({
        downloadUrl: 'https://r2.example.com/media/\x00evil.png',
      } as GetMediaDownloadResponse),
    );

    expect(await resolveMediaDownloadUrl(controlCharClient, 'm1')).toBeNull();
  });

  it('returns null when getMediaDownload throws an RPC error', async () => {
    const errorClient = fakeMediaClient(() => Promise.reject(new Error('RPC error: not found')));

    const result = await resolveMediaDownloadUrl(errorClient, 'media-123');
    expect(result).toBeNull();
  });
});

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MEDIA_STATUS, type GetMediaDownloadResponse, type MediaAttachment } from '@patches/proto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PatchesApi } from '../api/client.js';
import { hasUnsafeLeadingDash, openMediaExternally } from './open-external.js';
import { MediaCache } from './cache.js';

function attachment(overrides: Partial<MediaAttachment> = {}): MediaAttachment {
  return {
    mediaId: 'media-1',
    altText: '',
    width: 10,
    height: 10,
    mimeType: 'image/png',
    position: 0,
    ...overrides,
  };
}

describe('openMediaExternally (B-004/P5-003, spec §76)', () => {
  const originalFetch = globalThis.fetch;
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'patches-open-external-'));
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response(new Uint8Array([1, 2, 3]), { status: 200 })),
    );
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it('is a no-op under PATCHES_NO_OPEN — never spawns anything (test/CI safety)', async () => {
    const spawnFn = vi.fn();
    const getMediaDownload = vi.fn();
    const api = { getMediaDownload } as unknown as PatchesApi;
    const cache = new MediaCache({ dir });
    await openMediaExternally(api, cache, attachment(), () => Promise.resolve('token'), {
      env: { PATCHES_NO_OPEN: '1' },
      spawnFn,
    });
    expect(spawnFn).not.toHaveBeenCalled();
    expect(getMediaDownload).not.toHaveBeenCalled();
  });

  it('downloads, caches, and spawns the OS opener with argument-array only (never a shell string)', async () => {
    const spawnFn = vi.fn();
    const download: GetMediaDownloadResponse = {
      mediaId: 'media-1',
      status: MEDIA_STATUS.READY,
      mimeType: 'image/png',
      width: 10,
      height: 10,
      downloadUrl: 'https://example.test/media-1',
      thumbnailUrl: '',
      expiresAt: undefined,
    };
    const api = {
      getMediaDownload: vi.fn().mockResolvedValue(download),
    } as unknown as PatchesApi;
    const cache = new MediaCache({ dir });
    await openMediaExternally(api, cache, attachment(), () => Promise.resolve('token'), {
      env: {},
      spawnFn,
      platform: 'linux',
    });
    expect(spawnFn).toHaveBeenCalledTimes(1);
    const [command, args] = spawnFn.mock.calls[0] as [string, readonly string[]];
    expect(command).toBe('xdg-open');
    expect(args).toHaveLength(1);
    expect(args[0]).toContain('media-1');
  });

  it('throws a human-readable error when the media is still processing', async () => {
    const download: GetMediaDownloadResponse = {
      mediaId: 'media-1',
      status: MEDIA_STATUS.PROCESSING,
      mimeType: '',
      width: 0,
      height: 0,
      downloadUrl: '',
      thumbnailUrl: '',
      expiresAt: undefined,
    };
    const api = {
      getMediaDownload: vi.fn().mockResolvedValue(download),
    } as unknown as PatchesApi;
    const cache = new MediaCache({ dir });
    await expect(
      openMediaExternally(api, cache, attachment(), () => Promise.resolve('token'), {
        env: {},
        spawnFn: vi.fn(),
      }),
    ).rejects.toThrow(/processing/);
  });

  it('refuses to spawn a cached path that starts with "-" (A-045 argument-injection defense)', async () => {
    const download: GetMediaDownloadResponse = {
      mediaId: 'media-1',
      status: MEDIA_STATUS.READY,
      mimeType: 'image/png',
      width: 10,
      height: 10,
      downloadUrl: 'https://example.test/media-1',
      thumbnailUrl: '',
      expiresAt: undefined,
    };
    const api = {
      getMediaDownload: vi.fn().mockResolvedValue(download),
    } as unknown as PatchesApi;
    // `MediaCache.getOrFetch` always returns a `join(<absolute dir>, ...)` path in
    // practice — this stub only exists to exercise the defense-in-depth guard for the
    // case where that invariant ever breaks.
    const cache = {
      getOrFetch: vi.fn().mockResolvedValue({ bytes: new Uint8Array(), path: '--exec=evil' }),
    } as unknown as MediaCache;
    const spawnFn = vi.fn();
    await expect(
      openMediaExternally(api, cache, attachment(), () => Promise.resolve('token'), {
        env: {},
        spawnFn,
      }),
    ).rejects.toThrow(/unsafe local path/);
    expect(spawnFn).not.toHaveBeenCalled();
  });
});

describe('hasUnsafeLeadingDash', () => {
  it('flags a leading dash', () => {
    expect(hasUnsafeLeadingDash('-flag')).toBe(true);
    expect(hasUnsafeLeadingDash('--exec=evil')).toBe(true);
  });

  it('accepts an ordinary absolute path or URL', () => {
    expect(hasUnsafeLeadingDash('/home/user/.cache/patches/media/media-1.display.png')).toBe(false);
    expect(hasUnsafeLeadingDash('https://example.test/page')).toBe(false);
  });
});

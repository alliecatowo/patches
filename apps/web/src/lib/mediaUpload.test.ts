import type { PatchesApi } from '@patches/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockBeginMediaUpload = vi.fn();
const mockFinalizeMediaUpload = vi.fn();

vi.mock('../api/client.js', () => ({
  api: {
    media: {
      beginMediaUpload: mockBeginMediaUpload,
      finalizeMediaUpload: mockFinalizeMediaUpload,
    },
  } as unknown as PatchesApi,
}));

// Imported only after the mock factory above is registered (vitest hoists
// `vi.mock` above the static imports — the deferred import sees the mocked
// module, matching ComposeRoute.test.tsx's pattern).
const { uploadMedia } = await import('./mediaUpload.js');

/**
 * Minimal XHR stand-in: records everything `uploadMedia` does to the request so
 * tests can assert the presigned-PUT contract, then lets a test drive the
 * outcome (`onload`/`onerror`) explicitly.
 */
class FakeXhr {
  static instances: FakeXhr[] = [];

  method = '';
  url = '';
  status = 0;
  headers: Record<string, string> = {};
  sentBody: unknown = null;
  // jsdom's progress event only ever carries these three fields through here.
  upload: {
    onprogress:
      ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null;
  } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string): void {
    this.headers[name.toLowerCase()] = value;
  }

  send(body: unknown): void {
    this.sentBody = body;
    FakeXhr.instances.push(this);
  }
}

function pngFile(content: string): File {
  return new File([content], 'shot.png', { type: 'image/png' });
}

/** Waits for `uploadMedia`'s async preamble (sha256 + Begin RPC) to have sent the PUT. */
async function sentXhr(): Promise<FakeXhr> {
  let xhr: FakeXhr | undefined;
  await vi.waitFor(() => {
    xhr = FakeXhr.instances[0];
    expect(xhr).toBeDefined();
  });
  return xhr as FakeXhr;
}

describe('uploadMedia', () => {
  beforeEach(() => {
    FakeXhr.instances = [];
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    mockBeginMediaUpload.mockReset().mockResolvedValue({
      mediaId: 'media-1',
      uploadUrl: 'http://storage.example/presigned-put',
      expiresAt: new Date(0),
    });
    mockFinalizeMediaUpload.mockReset().mockResolvedValue({ mediaId: 'media-1' });
  });

  it('begins with the file type, size and sha256, PUTs presigned, then finalizes', async () => {
    const promise = uploadMedia(pngFile('hello'), vi.fn());
    const xhr = await sentXhr();

    // Begin request carries the exact file facts (sha256 of "hello", lowercase hex).
    expect(mockBeginMediaUpload).toHaveBeenCalledWith({
      mimeType: 'image/png',
      byteSize: 5n,
      sha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    });

    // Presigned-PUT contract: right method/URL, Content-Type exactly as
    // presigned, and NO Authorization header — storage rejects signed URLs for
    // requests carrying extra headers.
    expect(xhr.method).toBe('PUT');
    expect(xhr.url).toBe('http://storage.example/presigned-put');
    expect(xhr.headers['content-type']).toBe('image/png');
    expect(xhr.headers['authorization']).toBeUndefined();
    expect(xhr.sentBody).toBeInstanceOf(File);

    xhr.status = 201;
    const settled = expect(promise).resolves.toBe('media-1');
    xhr.onload?.();
    await settled;
    expect(mockFinalizeMediaUpload).toHaveBeenCalledWith({ mediaId: 'media-1' });
  });

  it('reports fractional progress from the upload event', async () => {
    const onProgress = vi.fn();
    const promise = uploadMedia(pngFile('hello'), onProgress);
    const xhr = await sentXhr();

    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 2, total: 5 });
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 5 });
    expect(onProgress).toHaveBeenNthCalledWith(1, 2 / 5);
    expect(onProgress).toHaveBeenNthCalledWith(2, 1);

    xhr.status = 200;
    const settled = expect(promise).resolves.toBe('media-1');
    xhr.onload?.();
    await settled;
  });

  it('rejects on an HTTP error status and never finalizes', async () => {
    const promise = uploadMedia(pngFile('hello'), vi.fn());
    const xhr = await sentXhr();

    xhr.status = 403;
    const settled = expect(promise).rejects.toThrow('Upload failed (HTTP 403).');
    xhr.onload?.();
    await settled;
    expect(mockFinalizeMediaUpload).not.toHaveBeenCalled();
  });

  it('names network/CORS blocking as such when the browser refuses the request', async () => {
    const promise = uploadMedia(pngFile('hello'), vi.fn());
    const xhr = await sentXhr();

    const settled = expect(promise).rejects.toThrow(/blocked before it reached storage/);
    xhr.onerror?.();
    await settled;
    expect(mockFinalizeMediaUpload).not.toHaveBeenCalled();
  });
});

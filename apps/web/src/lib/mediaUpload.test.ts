import type { PatchesApi } from '@patches/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

// Retry-window mirrors of the implementation's constants (500ms * 2^(n-1) +
// jitter in [0, 250)): the nth backoff fires somewhere in [min, max). Tests
// advance just below the min to prove no early retry, then past the max.
const FIRST_BACKOFF_MAX_MS = 750;
const SECOND_BACKOFF_MAX_MS = 1250;

/**
 * Minimal XHR stand-in: records everything `uploadMedia` does to the request so
 * tests can assert the presigned-PUT contract, then lets a test drive the
 * outcome (`onload`/`onerror`/`abort`) explicitly.
 */
class FakeXhr {
  static instances: FakeXhr[] = [];

  method = '';
  url = '';
  status = 0;
  headers: Record<string, string> = {};
  sentBody: unknown = null;
  aborted = false;
  // jsdom's progress event only ever carries these three fields through here.
  upload: {
    onprogress:
      ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null;
  } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

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

  /** Mirrors the spec firing `abort` synchronously on `xhr.abort()`. */
  abort(): void {
    this.aborted = true;
    this.onabort?.();
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

/** Deterministic instance read — retries are only scheduled after clock advances. */
function xhrAt(index: number): FakeXhr {
  const xhr = FakeXhr.instances[index];
  if (!xhr) throw new Error(`expected XHR #${String(index)} to have been sent`);
  return xhr;
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

  // Retry tests switch to fake timers mid-flight (after the real-timer
  // sha256/Begin preamble) and must never leak the fake clock into others.
  afterEach(() => {
    vi.useRealTimers();
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

  it('rejects on a 4xx status immediately — no retry — and never finalizes', async () => {
    const promise = uploadMedia(pngFile('hello'), vi.fn());
    const xhr = await sentXhr();

    xhr.status = 403;
    const settled = expect(promise).rejects.toThrow('Upload failed (HTTP 403).');
    xhr.onload?.();
    await settled;
    // 4xx is permanent: the one and only PUT attempt, nothing rescheduled.
    expect(FakeXhr.instances.length).toBe(1);
    expect(mockFinalizeMediaUpload).not.toHaveBeenCalled();
  });

  it('retries a transient network failure with backoff and succeeds on the third PUT', async () => {
    const promise = uploadMedia(pngFile('hello'), vi.fn());
    const first = await sentXhr();
    expect(FakeXhr.instances.length).toBe(1);

    // Failure 1 → retry 1 fires after 500–750ms.
    first.onerror?.();
    vi.useFakeTimers();
    await vi.advanceTimersByTimeAsync(FIRST_BACKOFF_MAX_MS - 251);
    expect(FakeXhr.instances.length).toBe(1);
    await vi.advanceTimersByTimeAsync(251);
    const second = xhrAt(1);
    expect(second.url).toBe('http://storage.example/presigned-put');
    expect(second.sentBody).toBeInstanceOf(File);

    // Failure 2 → retry 2 fires after 1000–1250ms (exponential, not flat).
    second.onerror?.();
    await vi.advanceTimersByTimeAsync(SECOND_BACKOFF_MAX_MS - 251);
    expect(FakeXhr.instances.length).toBe(2);
    await vi.advanceTimersByTimeAsync(251);
    const third = xhrAt(2);

    vi.useRealTimers();
    third.status = 201;
    const settled = expect(promise).resolves.toBe('media-1');
    third.onload?.();
    await settled;
    expect(mockFinalizeMediaUpload).toHaveBeenCalledTimes(1);
  });

  it('retries a 5xx response and succeeds once storage recovers', async () => {
    const promise = uploadMedia(pngFile('hello'), vi.fn());
    const first = await sentXhr();

    first.status = 503;
    first.onload?.();
    vi.useFakeTimers();
    await vi.advanceTimersByTimeAsync(FIRST_BACKOFF_MAX_MS);
    const second = xhrAt(1);

    second.status = 500;
    second.onload?.();
    await vi.advanceTimersByTimeAsync(SECOND_BACKOFF_MAX_MS);
    const third = xhrAt(2);

    vi.useRealTimers();
    third.status = 201;
    const settled = expect(promise).resolves.toBe('media-1');
    third.onload?.();
    await settled;
    expect(mockFinalizeMediaUpload).toHaveBeenCalledTimes(1);
  });

  it('names network/CORS blocking as such once retries are exhausted', async () => {
    const promise = uploadMedia(pngFile('hello'), vi.fn());
    const first = await sentXhr();

    first.onerror?.();
    vi.useFakeTimers();
    await vi.advanceTimersByTimeAsync(FIRST_BACKOFF_MAX_MS);
    const second = xhrAt(1);
    second.onerror?.();
    await vi.advanceTimersByTimeAsync(SECOND_BACKOFF_MAX_MS);
    const third = xhrAt(2);

    // Failure 3 hits MAX_ATTEMPTS: reject with the network/CORS message.
    const settled = expect(promise).rejects.toThrow(/blocked before it reached storage/);
    third.onerror?.();
    await settled;
    expect(FakeXhr.instances.length).toBe(3);
    expect(mockFinalizeMediaUpload).not.toHaveBeenCalled();
  });

  it('rejects immediately, without beginning, when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      uploadMedia(pngFile('hello'), vi.fn(), { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(mockBeginMediaUpload).not.toHaveBeenCalled();
    expect(FakeXhr.instances.length).toBe(0);
  });

  it('aborting mid-PUT aborts the XHR, never retries, and never finalizes', async () => {
    const controller = new AbortController();
    const promise = uploadMedia(pngFile('hello'), vi.fn(), { signal: controller.signal });
    const xhr = await sentXhr();

    const settled = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    // The external signal reached all the way down to xhr.abort().
    expect(xhr.aborted).toBe(true);
    await settled;
    expect(FakeXhr.instances.length).toBe(1);
    expect(mockFinalizeMediaUpload).not.toHaveBeenCalled();
  });

  it('aborting during retry backoff rejects immediately and cancels the pending retry', async () => {
    const controller = new AbortController();
    const promise = uploadMedia(pngFile('hello'), vi.fn(), { signal: controller.signal });
    const first = await sentXhr();

    first.onerror?.();
    vi.useFakeTimers();
    await vi.advanceTimersByTimeAsync(1); // backoff timer pending, ~500ms left on it

    const settled = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await settled;

    // The retry timer was really cleared, not raced: no second PUT ever appears.
    await vi.advanceTimersByTimeAsync(FIRST_BACKOFF_MAX_MS);
    expect(FakeXhr.instances.length).toBe(1);
    expect(mockFinalizeMediaUpload).not.toHaveBeenCalled();
  });
});

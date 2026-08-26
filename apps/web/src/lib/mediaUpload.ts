import { api } from '../api/client.js';

export interface MediaUploadHandle {
  mediaId: string;
  file: File;
  progress: number;
  status: 'uploading' | 'processing' | 'ready' | 'error';
  error?: string;
}

/** Options for {@link uploadMedia}; all fields optional for call-site compat. */
export interface UploadMediaOptions {
  /**
   * External cancel switch. Aborting aborts the in-flight PUT (or the backoff
   * sleep between retries) immediately, never retries, and rejects with a
   * `DOMException` whose `name` is `'AbortError'` (the shape `fetch`/XHR
   * callers already branch on). Default: no cancellation.
   */
  signal?: AbortSignal;
}

/** Total PUT attempts (1 initial + 2 retries) before surfacing the failure. */
const PUT_MAX_ATTEMPTS = 3;
/** Backoff before retry n: `PUT_RETRY_BASE_DELAY_MS * 2^(n-1)` + jitter. */
const PUT_RETRY_BASE_DELAY_MS = 500;
const PUT_RETRY_JITTER_MS = 250;

/** Storage answered with a failure status (4xx permanent, 5xx transient). */
class HttpUploadError extends Error {
  constructor(readonly status: number) {
    super(`Upload failed (HTTP ${String(status)}).`);
    this.name = 'HttpUploadError';
  }
}

/** The PUT never completed — network failure or a CORS refusal by storage. */
class NetworkUploadError extends Error {
  constructor() {
    super(
      'The upload was blocked before it reached storage — check your connection; ' +
        'if it keeps failing, storage may not accept browser uploads from this site (CORS).',
    );
    this.name = 'NetworkUploadError';
  }
}

function isTransientPutFailure(error: unknown): boolean {
  if (error instanceof NetworkUploadError) return true;
  return error instanceof HttpUploadError && error.status >= 500;
}

function abortError(): DOMException {
  return new DOMException('The media upload was aborted.', 'AbortError');
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError();
}

/** `setTimeout` that an abort wins immediately: no timer leak, no late retry. */
function abortableSleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort);
  });
}

/** One presigned PUT attempt; rejects with a classified error for the loop. */
function putPresignedOnce(
  url: string,
  contentType: string,
  file: File,
  onProgress: (fraction: number) => void,
  signal: AbortSignal | undefined,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const onSignalAbort = (): void => {
      xhr.abort();
    };
    const detachSignal = (): void => {
      signal?.removeEventListener('abort', onSignalAbort);
    };
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      detachSignal();
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new HttpUploadError(xhr.status));
    };
    // `status === 0` means the browser never let the request complete — a
    // network failure or, for a cross-origin presigned PUT, usually a CORS
    // refusal by the storage endpoint (the bucket's CORS policy must allow
    // PUT from this web origin). The browser hides the exact reason from JS,
    // hence the pointer to the console.
    xhr.onerror = () => {
      detachSignal();
      reject(new NetworkUploadError());
    };
    // Fires only from `signal`-driven `xhr.abort()` above. Deliberately a
    // distinct error class from the retryable ones so abort never retries.
    xhr.onabort = () => {
      detachSignal();
      reject(abortError());
    };
    if (signal) {
      if (signal.aborted) {
        reject(abortError());
        return;
      }
      signal.addEventListener('abort', onSignalAbort);
    }
    xhr.send(file);
  });
}

async function putPresignedWithRetry(
  url: string,
  contentType: string,
  file: File,
  onProgress: (fraction: number) => void,
  signal: AbortSignal | undefined,
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await putPresignedOnce(url, contentType, file, onProgress, signal);
      return;
    } catch (error) {
      // Only transient failures (network error / 5xx) buy another attempt;
      // 4xx is permanent (bad presign, wrong content-type) and abort is final.
      if (attempt >= PUT_MAX_ATTEMPTS || !isTransientPutFailure(error)) throw error;
      await abortableSleep(
        PUT_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) + Math.random() * PUT_RETRY_JITTER_MS,
        signal,
      );
    }
  }
}

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Uploads one file directly to R2 via a presigned PUT URL (spec §101 — never
 * proxy image bytes through the Node app server). `onProgress` is driven by
 * `XMLHttpRequest.upload.onprogress` since `fetch` has no upload-progress
 * event.
 *
 * The PUT carries exactly one application header: the `Content-Type` the URL
 * was presigned for (`S3StorageClient.presignPut` opts content-type back into
 * the SigV4 signature, alongside the auto-signed `Content-Length`). Anything
 * else — an `Authorization` bearer above all — would make storage reject the
 * request as unsigned/`SignatureDoesNotMatch`, which is why this request is a
 * raw XHR and deliberately never touches the authed Connect transport.
 *
 * Transient PUT failures (network error, HTTP 5xx) are retried up to
 * `PUT_MAX_ATTEMPTS` total attempts with exponential backoff
 * (`500ms * 2^(n-1)` + up to 250ms jitter); 4xx statuses are permanent and
 * reject immediately. Passing `options.signal` and aborting it cancels the
 * in-flight PUT (or backoff) without retrying and rejects with an
 * `'AbortError'`-named `DOMException`.
 */
export async function uploadMedia(
  file: File,
  onProgress: (fraction: number) => void,
  { signal }: UploadMediaOptions = {},
): Promise<string> {
  throwIfAborted(signal);
  const sha256 = await sha256Hex(file);
  const begin = await api.media.beginMediaUpload({
    mimeType: file.type,
    byteSize: BigInt(file.size),
    sha256,
  });

  await putPresignedWithRetry(begin.uploadUrl, file.type, file, onProgress, signal);

  await api.media.finalizeMediaUpload({ mediaId: begin.mediaId });
  return begin.mediaId;
}

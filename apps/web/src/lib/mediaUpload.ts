import { api } from '../api/client.js';

export interface MediaUploadHandle {
  mediaId: string;
  file: File;
  progress: number;
  status: 'uploading' | 'processing' | 'ready' | 'error';
  error?: string;
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
 */
export async function uploadMedia(
  file: File,
  onProgress: (fraction: number) => void,
): Promise<string> {
  const sha256 = await sha256Hex(file);
  const begin = await api.media.beginMediaUpload({
    mimeType: file.type,
    byteSize: BigInt(file.size),
    sha256,
  });

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', begin.uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (HTTP ${String(xhr.status)}).`));
    // `status === 0` means the browser never let the request complete — a
    // network failure or, for a cross-origin presigned PUT, usually a CORS
    // refusal by the storage endpoint (the bucket's CORS policy must allow
    // PUT from this web origin). The browser hides the exact reason from JS,
    // hence the pointer to the console.
    xhr.onerror = () =>
      xhr.status === 0
        ? reject(
            new Error(
              'The upload was blocked before it reached storage — check your connection; ' +
                'if it keeps failing, storage may not accept browser uploads from this site (CORS).',
            ),
          )
        : reject(new Error(`Upload failed (${String(xhr.status)}).`));
    xhr.send(file);
  });

  await api.media.finalizeMediaUpload({ mediaId: begin.mediaId });
  return begin.mediaId;
}

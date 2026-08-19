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
        : reject(new Error(`Upload failed (${String(xhr.status)})`));
    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.send(file);
  });

  await api.media.finalizeMediaUpload({ mediaId: begin.mediaId });
  return begin.mediaId;
}

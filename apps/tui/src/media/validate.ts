import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { MAX_INPUT_BYTES } from '@patches/terminal-media';

/** Supported v0 media types (spec §28) — JPEG, PNG, WebP only. */
export type SupportedMediaMime = 'image/jpeg' | 'image/png' | 'image/webp';

export interface LocalImage {
  path: string;
  bytes: Uint8Array;
  mimeType: SupportedMediaMime;
  byteSize: number;
  sha256: string;
}

/** Thrown by `readLocalImage` for anything a user can fix by picking a different file —
 * never thrown for a bug in this process. `message` is shown directly in the TUI. */
export class InvalidAttachmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAttachmentError';
  }
}

/**
 * Sniffs the real format from magic bytes — never the filename extension or a
 * client-supplied MIME type (spec §31: "Do not trust: filename extensions,
 * client-provided MIME types"). Mirrors the worker's own validation
 * (`apps/worker` sharp pipeline) so a file this rejects would have been rejected
 * server-side anyway, just later and after a wasted upload.
 */
function sniffMimeType(bytes: Uint8Array): SupportedMediaMime | undefined {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return undefined;
}

/** Human-readable megabyte figure for error text, e.g. `10 MB`. */
function megabytes(bytes: number): string {
  return `${String(Math.round(bytes / (1024 * 1024)))} MB`;
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

/**
 * Reads and validates a local file before it is ever sent anywhere — existence,
 * size (spec §28's 10 MB ceiling, shared with `@patches/terminal-media`'s
 * `MAX_INPUT_BYTES` so the two limits cannot drift apart), and real image format via
 * magic bytes. Never trusts the path's extension.
 */
export async function readLocalImage(path: string): Promise<LocalImage> {
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      throw new InvalidAttachmentError(`No such file: ${path}`);
    }
    if (isErrnoException(error) && error.code === 'EISDIR') {
      throw new InvalidAttachmentError(`${path} is a directory, not a file.`);
    }
    throw new InvalidAttachmentError(`Can't read ${path}.`);
  }

  if (bytes.byteLength === 0) {
    throw new InvalidAttachmentError(`${path} is empty.`);
  }
  if (bytes.byteLength > MAX_INPUT_BYTES) {
    throw new InvalidAttachmentError(
      `${path} is larger than the ${megabytes(MAX_INPUT_BYTES)} limit.`,
    );
  }

  const mimeType = sniffMimeType(bytes);
  if (mimeType === undefined) {
    throw new InvalidAttachmentError('Only JPEG, PNG, or WebP images are supported.');
  }

  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return { path, bytes, mimeType, byteSize: bytes.byteLength, sha256 };
}

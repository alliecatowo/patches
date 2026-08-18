import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import {
  type DownloadedObject,
  type ObjectMetadata,
  type PresignGetOptions,
  type PresignGetResult,
  type PresignPutOptions,
  type PresignPutResult,
  type StorageClient,
} from './storage-client.js';

export interface S3StorageClientOptions {
  /** S3-compatible endpoint — an R2 account endpoint in production, MinIO's URL in dev
   * (ADR 0015). */
  endpoint: string;
  /** `auto` for R2; any non-empty string for MinIO (it is unused beyond SigV4 requiring
   * *a* value). */
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Path-style addressing. MinIO requires it; R2 also accepts it — default `true` so one
   * client works against both without branching on which backend it is (ADR 0015). */
  forcePathStyle?: boolean;
}

/**
 * The one `StorageClient` implementation, shared by R2 (prod) and MinIO (dev) — both speak
 * the S3 API (ADR 0005, ADR 0015).
 */
export class S3StorageClient implements StorageClient {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(options: S3StorageClientOptions) {
    this.bucket = options.bucket;
    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      forcePathStyle: options.forcePathStyle ?? true,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  async presignPut(key: string, options: PresignPutOptions): Promise<PresignPutResult> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: options.contentType,
      ContentLength: options.contentLength,
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: options.expiresInSeconds,
      // `Content-Length` is signed automatically once set on the command; `Content-Type`
      // is NOT — S3's presigner unconditionally treats it as unsignable unless explicitly
      // opted back in here (`docs/research/aws-sdk-s3-presigned-urls.md` §2). Without this,
      // a client could PUT any content type against a URL signed for `image/png`.
      signableHeaders: new Set(['content-type']),
    });
    return { url, expiresAt: expiryFrom(options.expiresInSeconds) };
  }

  async presignGet(key: string, options: PresignGetOptions): Promise<PresignGetResult> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentType: options.responseContentType,
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: options.expiresInSeconds,
    });
    return { url, expiresAt: expiryFrom(options.expiresInSeconds) };
  }

  async head(key: string): Promise<ObjectMetadata | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        contentType: result.ContentType,
        contentLength: result.ContentLength ?? 0,
        etag: result.ETag,
      };
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }

  /**
   * Downloads the full object, aborting once `maxBytes` is exceeded rather than buffering
   * an unbounded response — defense in depth beyond whatever size check already ran against
   * `head()` (a compromised/misbehaving backend could still lie about `Content-Length`).
   */
  async getObject(key: string, options: { maxBytes?: number } = {}): Promise<DownloadedObject> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const body = result.Body;
    if (body === undefined) {
      throw new Error(`Object "${key}" has no body.`);
    }

    const chunks: Buffer[] = [];
    let total = 0;
    // `result.Body` is a Node `Readable` when the S3Client runs under Node (the default
    // runtime for this SDK in this project) — not a web `ReadableStream`/`Blob`, both of
    // which the SDK's cross-runtime type also allows.
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.byteLength;
      if (options.maxBytes !== undefined && total > options.maxBytes) {
        throw new Error(
          `Object "${key}" exceeds the ${String(options.maxBytes)}-byte download limit.`,
        );
      }
      chunks.push(buffer);
    }

    return {
      body: Buffer.concat(chunks),
      contentType: result.ContentType,
      contentLength: total,
    };
  }

  async putObject(key: string, body: Buffer, options: { contentType: string }): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: options.contentType,
        ContentLength: body.byteLength,
      }),
    );
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      if (isNotFoundError(error)) return;
      throw error;
    }
  }
}

function expiryFrom(expiresInSeconds: number): Date {
  return new Date(Date.now() + expiresInSeconds * 1000);
}

/** S3-compatible stores raise this shape for a missing object on `HEAD`/`DELETE` — matched
 * defensively (name or HTTP status) since R2 and MinIO don't always agree on the error
 * `name` the SDK surfaces. */
function isNotFoundError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if ('name' in error && (error.name === 'NotFound' || error.name === 'NoSuchKey')) return true;
  if (!('$metadata' in error)) return false;
  const metadata = error.$metadata as { httpStatusCode?: number } | undefined;
  return metadata?.httpStatusCode === 404;
}

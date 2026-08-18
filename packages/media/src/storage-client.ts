/**
 * Storage abstraction over an S3-compatible object store (Cloudflare R2 in production,
 * MinIO for local dev — ADR 0005, ADR 0015). One implementation (`S3StorageClient`) serves
 * both, since both speak the S3 API; nothing above this interface knows which backend it
 * is talking to.
 */

/** Presigned PUT: one URL, one key, a short expiry (`docs/architecture/media.md` §3). */
export interface PresignPutOptions {
  /** Enforced by SigV4 — the client's PUT must send this exact `Content-Type` header, or
   * the signature is invalid and R2/MinIO rejects the request before it reaches this app. */
  contentType: string;
  expiresInSeconds: number;
}

export interface PresignPutResult {
  url: string;
  expiresAt: Date;
}

export interface PresignGetOptions {
  expiresInSeconds: number;
  /** Overrides the `Content-Type` the object is served with, if the caller wants it
   * distinct from whatever was stored (rarely needed; usually omitted). */
  responseContentType?: string;
}

export interface PresignGetResult {
  url: string;
  expiresAt: Date;
}

/** What `HeadObjectCommand` gives back — used to confirm a client's claimed upload actually
 * landed, without ever downloading the bytes through this process (§153). */
export interface ObjectMetadata {
  contentType: string | undefined;
  contentLength: number;
  etag: string | undefined;
}

/** A downloaded object's bytes plus what the store says about them. Bounded by the caller
 * (`maxBytes` on {@link StorageClient.getObject}) — never buffered without a limit. */
export interface DownloadedObject {
  body: Buffer;
  contentType: string | undefined;
  contentLength: number;
}

export interface StorageClient {
  /** One presigned URL, scoped to exactly this key, for the client to `PUT` its upload to
   * directly — the bytes never transit this process (§153). */
  presignPut(key: string, options: PresignPutOptions): Promise<PresignPutResult>;

  /** One presigned URL for the client to `GET` from directly. Issued only after this
   * process has authorized the caller for that object (§32). */
  presignGet(key: string, options: PresignGetOptions): Promise<PresignGetResult>;

  /** `null` if the object does not exist — never throws for a plain not-found. */
  head(key: string): Promise<ObjectMetadata | null>;

  /** Downloads an object's full bytes, refusing anything over `maxBytes` by aborting the
   * read rather than buffering an unbounded response (defense in depth ahead of whatever
   * `head()`-based size check already ran). Used by the worker only — this process never
   * proxies a *client* upload/download, but it does have to read the original to process it
   * (`docs/architecture/media.md` §4). */
  getObject(key: string, options?: { maxBytes?: number }): Promise<DownloadedObject>;

  /** Uploads worker-generated derivative bytes directly (not presigned — the worker holds
   * real credentials, unlike the client). */
  putObject(key: string, body: Buffer, options: { contentType: string }): Promise<void>;

  /** No-op if the object does not exist. */
  deleteObject(key: string): Promise<void>;
}

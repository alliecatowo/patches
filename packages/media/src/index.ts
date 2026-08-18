export {
  ACCEPTED_MEDIA_CONTENT_TYPES,
  MAX_MEDIA_BYTES,
  MAX_MEDIA_PIXELS,
  MEDIA_CONTENT_TYPE_EXTENSION,
  isAcceptedMediaContentType,
  type AcceptedMediaContentType,
} from './limits.js';

export {
  MEDIA_VARIANTS,
  isMediaObjectKey,
  mediaOriginalKey,
  mediaVariantKey,
  type MediaVariant,
} from './keys.js';

export type {
  DownloadedObject,
  ObjectMetadata,
  PresignGetOptions,
  PresignGetResult,
  PresignPutOptions,
  PresignPutResult,
  StorageClient,
} from './storage-client.js';

export { S3StorageClient, type S3StorageClientOptions } from './s3-storage-client.js';

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mocked before the module under test imports it, so `S3StorageClient` gets these fakes —
// no real network calls (`docs/agents/PACKAGE_CONVENTIONS.md`: unit tests, no network).
const sendMock = vi.fn();
const getSignedUrlMock = vi.fn();

vi.mock('@aws-sdk/client-s3', () => {
  class FakeCommand<Input> {
    constructor(public readonly input: Input) {}
  }
  return {
    // A real `function`, not an arrow function: `new S3Client(...)` in the code under test
    // requires the mock implementation itself to be constructible.
    S3Client: vi.fn().mockImplementation(function S3ClientMock() {
      return { send: sendMock };
    }),
    PutObjectCommand: FakeCommand,
    GetObjectCommand: FakeCommand,
    HeadObjectCommand: FakeCommand,
    DeleteObjectCommand: FakeCommand,
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: getSignedUrlMock,
}));

const { S3StorageClient } = await import('./s3-storage-client.js');

function client(): InstanceType<typeof S3StorageClient> {
  return new S3StorageClient({
    endpoint: 'http://127.0.0.1:9000',
    region: 'auto',
    bucket: 'patches-media',
    accessKeyId: 'patches',
    secretAccessKey: 'patchespatches',
  });
}

beforeEach(() => {
  sendMock.mockReset();
  getSignedUrlMock.mockReset();
});

describe('S3StorageClient', () => {
  it('presigns a PUT scoped to the given key and content type, with a short expiry', async () => {
    getSignedUrlMock.mockResolvedValue('https://signed.example/put');

    const result = await client().presignPut('media/abc/original', {
      contentType: 'image/png',
      contentLength: 4096,
      expiresInSeconds: 300,
    });

    expect(result.url).toBe('https://signed.example/put');
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    const [, command, options] = getSignedUrlMock.mock.calls[0] as [
      unknown,
      { input: { Bucket: string; Key: string; ContentType: string; ContentLength: number } },
      { expiresIn: number; signableHeaders: Set<string> },
    ];
    expect(command.input).toMatchObject({
      Bucket: 'patches-media',
      Key: 'media/abc/original',
      ContentType: 'image/png',
      ContentLength: 4096,
    });
    expect(options.expiresIn).toBe(300);
    // Content-Type is unsignable by default (docs/research/aws-sdk-s3-presigned-urls.md
    // §2) — must be explicitly opted back in, or the signed URL wouldn't actually enforce
    // it against a mismatched client PUT.
    expect(options.signableHeaders?.has('content-type')).toBe(true);
  });

  it('presigns a GET scoped to the given key', async () => {
    getSignedUrlMock.mockResolvedValue('https://signed.example/get');

    const result = await client().presignGet('media/abc/v/display', { expiresInSeconds: 600 });

    expect(result.url).toBe('https://signed.example/get');
    const [, command] = getSignedUrlMock.mock.calls[0] as [
      unknown,
      { input: { Bucket: string; Key: string } },
    ];
    expect(command.input).toMatchObject({ Bucket: 'patches-media', Key: 'media/abc/v/display' });
  });

  it('head() returns metadata for an existing object', async () => {
    sendMock.mockResolvedValue({ ContentType: 'image/png', ContentLength: 1234, ETag: '"abc"' });

    const result = await client().head('media/abc/original');

    expect(result).toEqual({ contentType: 'image/png', contentLength: 1234, etag: '"abc"' });
  });

  it('head() returns null for a missing object instead of throwing', async () => {
    sendMock.mockRejectedValue(Object.assign(new Error('not found'), { name: 'NotFound' }));

    const result = await client().head('media/missing/original');

    expect(result).toBeNull();
  });

  it('head() rethrows errors that are not "not found"', async () => {
    sendMock.mockRejectedValue(new Error('boom'));

    await expect(client().head('media/abc/original')).rejects.toThrow('boom');
  });

  it('getObject() concatenates the streamed body and reports its length', async () => {
    sendMock.mockResolvedValue({
      ContentType: 'image/jpeg',
      Body: (function* () {
        yield Buffer.from('hello ');
        yield Buffer.from('world');
      })(),
    });

    const result = await client().getObject('media/abc/original');

    expect(result.body.toString('utf8')).toBe('hello world');
    expect(result.contentLength).toBe(11);
    expect(result.contentType).toBe('image/jpeg');
  });

  it('getObject() aborts once maxBytes is exceeded', async () => {
    sendMock.mockResolvedValue({
      Body: (function* () {
        yield Buffer.alloc(10);
        yield Buffer.alloc(10);
      })(),
    });

    await expect(client().getObject('media/abc/original', { maxBytes: 15 })).rejects.toThrow(
      /exceeds/,
    );
  });

  it('putObject() sends the body with its content type and length', async () => {
    sendMock.mockResolvedValue({});
    const body = Buffer.from('derivative bytes');

    await client().putObject('media/abc/v/thumb', body, { contentType: 'image/webp' });

    const [command] = sendMock.mock.calls[0] as [{ input: Record<string, unknown> }];
    expect(command.input).toMatchObject({
      Bucket: 'patches-media',
      Key: 'media/abc/v/thumb',
      Body: body,
      ContentType: 'image/webp',
      ContentLength: body.byteLength,
    });
  });

  it('deleteObject() is a no-op when the object is already gone', async () => {
    sendMock.mockRejectedValue(Object.assign(new Error('gone'), { name: 'NoSuchKey' }));

    await expect(client().deleteObject('media/abc/original')).resolves.toBeUndefined();
  });
});

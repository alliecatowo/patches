import { describe, expect, it } from 'vitest';
import { isAppError } from '../../common/errors/app-error.js';
import { parseByteSize, validateBeginMediaUploadInput } from './validation.js';

const VALID_SHA256 = '0'.repeat(64);

describe('validateBeginMediaUploadInput', () => {
  it('accepts a well-formed jpeg/png/webp request', () => {
    for (const mimeType of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(() =>
        validateBeginMediaUploadInput({ mimeType, byteSize: 1024, sha256: VALID_SHA256 }),
      ).not.toThrow();
    }
  });

  it('rejects an unsupported content type with MEDIA_UNSUPPORTED_TYPE', () => {
    try {
      validateBeginMediaUploadInput({
        mimeType: 'image/gif',
        byteSize: 1024,
        sha256: VALID_SHA256,
      });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(isAppError(error) && error.code).toBe('MEDIA_UNSUPPORTED_TYPE');
    }
  });

  it('rejects a byte_size over the limit with MEDIA_TOO_LARGE', () => {
    try {
      validateBeginMediaUploadInput({
        mimeType: 'image/png',
        byteSize: 10 * 1024 * 1024 + 1,
        sha256: VALID_SHA256,
      });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(isAppError(error) && error.code).toBe('MEDIA_TOO_LARGE');
    }
  });

  it('rejects a non-positive byte_size with MEDIA_TOO_LARGE', () => {
    try {
      validateBeginMediaUploadInput({ mimeType: 'image/png', byteSize: 0, sha256: VALID_SHA256 });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(isAppError(error) && error.code).toBe('MEDIA_TOO_LARGE');
    }
  });

  it('rejects a malformed sha256 with VALIDATION_ERROR', () => {
    try {
      validateBeginMediaUploadInput({ mimeType: 'image/png', byteSize: 1024, sha256: 'not-hex' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(isAppError(error) && error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('rejects an uppercase-hex sha256 (must be lowercase)', () => {
    try {
      validateBeginMediaUploadInput({
        mimeType: 'image/png',
        byteSize: 1024,
        sha256: 'A'.repeat(64),
      });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(isAppError(error) && error.code).toBe('VALIDATION_ERROR');
    }
  });
});

describe('parseByteSize', () => {
  it('parses a plain digit string', () => {
    expect(parseByteSize('1024')).toBe(1024);
    expect(parseByteSize('0')).toBe(0);
  });

  it('rejects non-numeric strings', () => {
    expect(() => parseByteSize('abc')).toThrow();
    expect(() => parseByteSize('-1')).toThrow();
    expect(() => parseByteSize('1.5')).toThrow();
  });

  it('rejects a value beyond Number.MAX_SAFE_INTEGER', () => {
    expect(() => parseByteSize('99999999999999999999999999')).toThrow();
  });
});

import { status as GrpcStatus } from '@grpc/grpc-js';
import { describe, expect, it } from 'vitest';

import { AppError, isAppError } from './app-error.js';
import { ERROR_CODES, ERROR_CODE_TO_GRPC_STATUS, grpcStatusForErrorCode } from './error-codes.js';

describe('error code → gRPC status mapping', () => {
  it('maps every declared code', () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_CODE_TO_GRPC_STATUS[code]).toBeTypeOf('number');
    }
    expect(Object.keys(ERROR_CODE_TO_GRPC_STATUS).sort()).toEqual([...ERROR_CODES].sort());
  });

  it('matches the table in docs/architecture/api.md §7', () => {
    expect(grpcStatusForErrorCode('AUTH_INVALID_CREDENTIALS')).toBe(GrpcStatus.UNAUTHENTICATED);
    expect(grpcStatusForErrorCode('AUTH_SESSION_EXPIRED')).toBe(GrpcStatus.UNAUTHENTICATED);
    expect(grpcStatusForErrorCode('ACTOR_NOT_FOUND')).toBe(GrpcStatus.NOT_FOUND);
    expect(grpcStatusForErrorCode('POST_NOT_FOUND')).toBe(GrpcStatus.NOT_FOUND);
    expect(grpcStatusForErrorCode('HANDLE_TAKEN')).toBe(GrpcStatus.ALREADY_EXISTS);
    expect(grpcStatusForErrorCode('ACTOR_BLOCKED')).toBe(GrpcStatus.PERMISSION_DENIED);
    expect(grpcStatusForErrorCode('POST_FORBIDDEN')).toBe(GrpcStatus.PERMISSION_DENIED);
    expect(grpcStatusForErrorCode('POST_TOO_LONG')).toBe(GrpcStatus.INVALID_ARGUMENT);
    expect(grpcStatusForErrorCode('MEDIA_TOO_LARGE')).toBe(GrpcStatus.INVALID_ARGUMENT);
    expect(grpcStatusForErrorCode('MEDIA_UNSUPPORTED_TYPE')).toBe(GrpcStatus.INVALID_ARGUMENT);
    expect(grpcStatusForErrorCode('VALIDATION_ERROR')).toBe(GrpcStatus.INVALID_ARGUMENT);
    expect(grpcStatusForErrorCode('RATE_LIMITED')).toBe(GrpcStatus.RESOURCE_EXHAUSTED);
    expect(grpcStatusForErrorCode('INTERNAL_ERROR')).toBe(GrpcStatus.INTERNAL);
  });

  it('uses FAILED_PRECONDITION for well-formed requests blocked by state', () => {
    expect(grpcStatusForErrorCode('AUTH_EMAIL_UNVERIFIED')).toBe(GrpcStatus.FAILED_PRECONDITION);
    expect(grpcStatusForErrorCode('MEDIA_NOT_READY')).toBe(GrpcStatus.FAILED_PRECONDITION);
    expect(grpcStatusForErrorCode('CLIENT_VERSION_UNSUPPORTED')).toBe(GrpcStatus.FAILED_PRECONDITION);
  });
});

describe('AppError', () => {
  it('carries its code and preserves the cause without exposing it', () => {
    const cause = new Error('connection reset by peer');
    const error = AppError.internal('Something went wrong on our side.', { cause });

    expect(isAppError(error)).toBe(true);
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.cause).toBe(cause);
    expect(error.message).not.toContain('connection reset');
  });

  it('is not confused with a plain Error', () => {
    expect(isAppError(new Error('nope'))).toBe(false);
    expect(isAppError('nope')).toBe(false);
  });
});

import { type ArgumentsHost } from '@nestjs/common';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { describe, expect, it } from 'vitest';

import { runWithRequestContext } from '../context/request-context.js';
import { AppError } from './app-error.js';
import { RpcExceptionsFilter } from './rpc-exception.filter.js';

interface CaughtError {
  code: GrpcStatus;
  message: string;
  details: string;
  metadata: { get: (key: string) => unknown[] };
}

const STUB_HOST = { getType: () => 'rpc' } as unknown as ArgumentsHost;

function catchException(exception: unknown): Promise<CaughtError> {
  const filter = new RpcExceptionsFilter();
  return new Promise((resolve, reject) => {
    filter.catch(exception, STUB_HOST).subscribe({
      next: () => {
        reject(new Error('expected the filter to error, not emit a value'));
      },
      error: (error: unknown) => {
        resolve(error as CaughtError);
      },
      complete: () => {
        reject(new Error('expected the filter to error, not complete'));
      },
    });
  });
}

function withRequestId<T>(requestId: string, fn: () => T): T {
  return runWithRequestContext(
    {
      requestId,
      client: undefined,
      clientVersion: undefined,
      rpc: 'test.Service/Method',
      peer: undefined,
    },
    fn,
  );
}

describe('RpcExceptionsFilter (spec §57)', () => {
  describe('AppError branch', () => {
    it('maps the code to its declared gRPC status and forwards the message', async () => {
      const error = await withRequestId('req-1', () =>
        catchException(new AppError('ACTOR_NOT_FOUND', 'That actor does not exist.')),
      );

      expect(error.code).toBe(GrpcStatus.NOT_FOUND);
      expect(error.message).toBe('That actor does not exist.');
      expect(error.details).toBe('That actor does not exist.');
      expect(error.metadata.get('x-patches-error-code')[0]).toBe('ACTOR_NOT_FOUND');
    });

    it('echoes the request id from the ambient request context', async () => {
      const error = await withRequestId('req-echo', () =>
        catchException(AppError.validation('bad input')),
      );

      expect(error.metadata.get('x-request-id')[0]).toBe('req-echo');
    });

    it('omits x-request-id when there is no ambient request context', async () => {
      const error = await catchException(AppError.validation('bad input'));
      expect(error.metadata.get('x-request-id')).toEqual([]);
    });
  });

  describe('RpcException branch — known ErrorCode payload', () => {
    it('maps a string payload naming one of our own codes', async () => {
      const error = await catchException(new RpcException('POST_NOT_FOUND'));

      expect(error.code).toBe(GrpcStatus.NOT_FOUND);
      expect(error.metadata.get('x-patches-error-code')[0]).toBe('POST_NOT_FOUND');
      expect(error.message).not.toContain('    at ');
    });

    it('maps an object payload naming one of our own codes, ignoring its message', async () => {
      const error = await catchException(
        new RpcException({ code: 'HANDLE_TAKEN', message: 'do not leak this text' }),
      );

      expect(error.code).toBe(GrpcStatus.ALREADY_EXISTS);
      expect(error.metadata.get('x-patches-error-code')[0]).toBe('HANDLE_TAKEN');
      expect(error.message).not.toContain('do not leak this text');
      expect(error.details).not.toContain('do not leak this text');
    });
  });

  describe('RpcException branch — no caller-controlled passthrough', () => {
    it('never forwards an arbitrary caller-supplied message', async () => {
      const error = await catchException(new RpcException('raw internal db detail'));

      expect(error.code).toBe(GrpcStatus.INTERNAL);
      expect(error.metadata.get('x-patches-error-code')[0]).toBe('INTERNAL_ERROR');
      expect(error.message).not.toContain('raw internal db detail');
    });

    it('never forwards an arbitrary caller-supplied numeric status or message', async () => {
      const error = await catchException(
        new RpcException({ code: 5, message: 'attacker-controlled status text' }),
      );

      // Not GrpcStatus 5 (NOT_FOUND) — the caller-supplied code must not pass through.
      expect(error.code).toBe(GrpcStatus.INTERNAL);
      expect(error.metadata.get('x-patches-error-code')[0]).toBe('INTERNAL_ERROR');
      expect(error.message).not.toContain('attacker-controlled status text');
    });

    it('still echoes the request id even for an unrecognised RpcException', async () => {
      const error = await withRequestId('req-2', () =>
        catchException(new RpcException('mystery failure')),
      );
      expect(error.metadata.get('x-request-id')[0]).toBe('req-2');
    });
  });

  describe('unhandled error branch', () => {
    it('never leaks a stack trace to the client', async () => {
      const error = await catchException(new Error('connection reset by peer at db.ts:42'));

      expect(error.code).toBe(GrpcStatus.INTERNAL);
      expect(error.metadata.get('x-patches-error-code')[0]).toBe('INTERNAL_ERROR');
      expect(error.message).not.toContain('connection reset by peer');
      expect(error.message).not.toContain('    at ');
    });

    it('handles a non-Error thrown value without crashing', async () => {
      const error = await catchException('a bare string throw');

      expect(error.code).toBe(GrpcStatus.INTERNAL);
      expect(error.metadata.get('x-patches-error-code')[0]).toBe('INTERNAL_ERROR');
      expect(error.message).not.toContain('a bare string throw');
    });

    it('includes the request id in the generic message when present, for support purposes', async () => {
      const error = await withRequestId('req-support-123', () => catchException(new Error('boom')));
      expect(error.message).toContain('req-support-123');
    });
  });
});

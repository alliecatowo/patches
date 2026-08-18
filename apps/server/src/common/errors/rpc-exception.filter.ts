import { Metadata, status as GrpcStatus } from '@grpc/grpc-js';
import { type ArgumentsHost, Catch, Logger, type RpcExceptionFilter } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { type Observable, throwError } from 'rxjs';

import { getRequestContext } from '../context/request-context.js';
import { AppError, isAppError } from './app-error.js';
import { type ErrorCode, grpcStatusForErrorCode } from './error-codes.js';

/** The shape grpc-js turns into a gRPC status on the wire. */
interface GrpcServerError {
  code: GrpcStatus;
  message: string;
  details: string;
  metadata: Metadata;
}

/**
 * Translates every uncaught error into a gRPC status (spec §57).
 *
 * Rules enforced here:
 * - stack traces and internal messages never reach the client;
 * - the application error code travels in `x-patches-error-code` metadata so a
 *   client can branch on it without string-matching the message;
 * - the request id is echoed back so a user can quote it in a bug report.
 */
@Catch()
export class RpcExceptionsFilter implements RpcExceptionFilter<unknown> {
  private readonly logger = new Logger(RpcExceptionsFilter.name);

  catch(exception: unknown, _host: ArgumentsHost): Observable<never> {
    return throwError(() => this.toGrpcError(exception));
  }

  private toGrpcError(exception: unknown): GrpcServerError {
    const requestId = getRequestContext()?.requestId;

    if (isAppError(exception)) {
      // Expected, handled failures: log at warn without a stack.
      this.logger.warn({
        msg: 'rpc.error',
        errorCode: exception.code,
        requestId,
        ...exception.context,
      });
      return this.build(grpcStatusForErrorCode(exception.code), exception.message, exception.code, requestId);
    }

    if (exception instanceof RpcException) {
      const error = exception.getError();
      if (typeof error === 'object' && error !== null && 'code' in error) {
        const { code, message } = error as { code: number; message?: string };
        return this.build(code as GrpcStatus, message ?? exception.message, 'INTERNAL_ERROR', requestId);
      }
      return this.build(GrpcStatus.UNKNOWN, exception.message, 'INTERNAL_ERROR', requestId);
    }

    // Anything else is a bug: log it in full, tell the client nothing useful.
    this.logger.error({ msg: 'rpc.unhandled_error', requestId }, toStack(exception));
    return this.build(
      GrpcStatus.INTERNAL,
      AppError.internal().message + (requestId === undefined ? '' : ` (request id: ${requestId})`),
      'INTERNAL_ERROR',
      requestId,
    );
  }

  private build(
    code: GrpcStatus,
    message: string,
    errorCode: ErrorCode,
    requestId: string | undefined,
  ): GrpcServerError {
    const metadata = new Metadata();
    metadata.set('x-patches-error-code', errorCode);
    if (requestId !== undefined) metadata.set('x-request-id', requestId);
    // grpc-js reads `details` for the status message; `message` is kept so Nest's
    // own logging and any in-process caller sees something sensible too.
    return { code, message, details: message, metadata };
  }
}

function toStack(exception: unknown): string {
  if (exception instanceof Error) return exception.stack ?? `${exception.name}: ${exception.message}`;
  return `Non-Error thrown: ${JSON.stringify(exception)}`;
}

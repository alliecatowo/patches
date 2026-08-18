import { Metadata, status as GrpcStatus } from '@grpc/grpc-js';
import { type ArgumentsHost, Catch, Logger, type RpcExceptionFilter } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { type Observable, throwError } from 'rxjs';

import { getRequestContext } from '../context/request-context.js';
import { AppError, isAppError } from './app-error.js';
import { ERROR_CODES, type ErrorCode, grpcStatusForErrorCode } from './error-codes.js';

const KNOWN_ERROR_CODES: ReadonlySet<string> = new Set(ERROR_CODES);

/**
 * `RpcException` can be constructed by anyone in the request path — application code,
 * Nest's own microservices internals — with an arbitrary string or `{ code, message }`
 * object. Neither is safe to forward to the client as-is (spec §57): only a payload
 * that names one of *our own* declared {@link ErrorCode}s is trusted. Everything else
 * is treated exactly like an unhandled error.
 */
function knownErrorCodeFrom(error: string | object): ErrorCode | undefined {
  const candidate = typeof error === 'string' ? error : (error as { code?: unknown }).code;
  return typeof candidate === 'string' && KNOWN_ERROR_CODES.has(candidate)
    ? (candidate as ErrorCode)
    : undefined;
}

/** A safe, generic client-visible message for a known code with no message of its own. */
function genericMessageFor(code: ErrorCode): string {
  return `Request failed: ${code.toLowerCase().replace(/_/g, ' ')}.`;
}

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
      return this.build(
        grpcStatusForErrorCode(exception.code),
        exception.message,
        exception.code,
        requestId,
      );
    }

    if (exception instanceof RpcException) {
      const knownCode = knownErrorCodeFrom(exception.getError());
      if (knownCode !== undefined) {
        // Recognised application error code: safe to report its real status and a
        // generic, code-derived message. Never the caller-supplied message — that part
        // of an RpcException's payload is not trusted.
        this.logger.warn({ msg: 'rpc.error', errorCode: knownCode, requestId });
        return this.build(
          grpcStatusForErrorCode(knownCode),
          genericMessageFor(knownCode),
          knownCode,
          requestId,
        );
      }

      // Unrecognised: no caller-controlled status or message passthrough. Log the raw
      // detail server-side and fall through to the same generic response as any other
      // unhandled error.
      this.logger.error({ msg: 'rpc.unhandled_rpc_exception', requestId }, toStack(exception));
      return this.internalError(requestId);
    }

    // Anything else is a bug: log it in full, tell the client nothing useful.
    this.logger.error({ msg: 'rpc.unhandled_error', requestId }, toStack(exception));
    return this.internalError(requestId);
  }

  private internalError(requestId: string | undefined): GrpcServerError {
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
  if (exception instanceof Error)
    return exception.stack ?? `${exception.name}: ${exception.message}`;
  return `Non-Error thrown: ${JSON.stringify(exception)}`;
}

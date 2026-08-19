import { Metadata, status as GrpcStatus } from '@grpc/grpc-js';
import {
  HttpException,
  type ArgumentsHost,
  Catch,
  Logger,
  type RpcExceptionFilter,
} from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { EMPTY, type Observable, throwError } from 'rxjs';

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

  catch(exception: unknown, host: ArgumentsHost): Observable<never> {
    // P8-001..008: this filter is `APP_FILTER`-global, so it also catches whatever escapes
    // the federation HTTP surface's controllers (which normally handle their own responses
    // via `@Res()` and never throw — this is a last-resort backstop, not the common path).
    // Returning an `Observable` the way the gRPC branch below does is meaningless for HTTP:
    // Nest's HTTP exception handling expects the filter to write the response itself, not
    // consume an RxJS value, so an uncaught throw here previously left the request hanging
    // with no response at all — the same class of bug the interceptor fix next to this one
    // addresses. Every internal detail is withheld here for the same reason the gRPC branch
    // withholds it (spec §57's sanitized-errors rule applies identically to both transports).
    if (host.getType() !== 'rpc') {
      const requestId = getRequestContext()?.requestId;
      const response = host.switchToHttp().getResponse<{
        statusCode?: number;
        setHeader: (name: string, value: string) => void;
        end: (body?: string) => void;
      }>();

      // Nest's own HTTP-layer exceptions — most commonly `NotFoundException`, which Nest
      // throws itself for any request that matches no controller route (every unmatched
      // path under the always-on HTTP listener, ADR 0016 §4: a stray path, a typo'd
      // `/healthz`, a Connect request for a service this schema doesn't have). These are
      // framework routing outcomes, not application bugs — spec §57's "sanitize errors"
      // rule is about *our* thrown errors leaking internals, not about masking Nest's own
      // 404/405 as a fake 500. Logged at `warn`, not `error` (found the hard way: every
      // client mistyping a path doesn't belong in the same log tier as an actual crash).
      if (exception instanceof HttpException) {
        this.logger.warn({ msg: 'http.exception', requestId, status: exception.getStatus() });
        response.statusCode = exception.getStatus();
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ error: exception.message, requestId }));
        return EMPTY;
      }

      this.logger.error({ msg: 'http.unhandled_exception', requestId }, toStack(exception));
      response.statusCode = 500;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ error: 'internal_error', requestId }));
      // The HTTP response is already fully written above — an HTTP exception filter's
      // return value (unlike an RPC one) is not what produces the client-visible response,
      // so this is just satisfying `RpcExceptionFilter<unknown>`'s `Observable<never>`
      // return type, never subscribed to for anything meaningful on this branch.
      return EMPTY;
    }
    return throwError(() => this.toGrpcError(exception));
  }

  private toGrpcError(exception: unknown): GrpcServerError {
    const requestId = getRequestContext()?.requestId;

    if (isAppError(exception)) {
      // Expected, handled failures: log at warn without a stack. `exception.context` is nested
      // under its own key rather than spread into the line — spreading it would let an
      // `AppError`'s caller-chosen context keys silently overwrite `msg`/`errorCode`/
      // `requestId` above (spec §57's structured-log fields must stay well-formed regardless
      // of what a given throw site put in `context`).
      this.logger.warn({
        msg: 'rpc.error',
        errorCode: exception.code,
        requestId,
        context: exception.context,
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

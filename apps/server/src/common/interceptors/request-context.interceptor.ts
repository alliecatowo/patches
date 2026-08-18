import { randomUUID } from 'node:crypto';

import { type Metadata } from '@grpc/grpc-js';
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { METADATA_KEYS, MIN_CLIENT_VERSION } from '@patches/proto';
import { Observable } from 'rxjs';

import { runWithRequestContext } from '../context/request-context.js';
import { AppError } from '../errors/app-error.js';
import { compareSemver, parseSemver } from '../version.js';

const MIN_CLIENT_SEMVER = parseSemver(MIN_CLIENT_VERSION);

/** `x-request-id` is logged and echoed back verbatim, so it is capped and shape-checked
 * before either happens (spec §103) — a caller-controlled value otherwise flows straight
 * into structured logs and response metadata. */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * Establishes per-RPC correlation data and enforces the §83 client version gate.
 *
 * Must be registered **before** the logging interceptor so log lines carry the
 * request id.
 */
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metadata = context.switchToRpc().getContext<Metadata>();

    const requestId = sanitizeRequestId(readMetadata(metadata, METADATA_KEYS.requestId));
    const client = readMetadata(metadata, METADATA_KEYS.client);
    const clientVersion = readMetadata(metadata, METADATA_KEYS.clientVersion);

    const requestContext = {
      requestId,
      client,
      clientVersion,
      rpc: rpcPath(context),
    };

    // The handler runs on *subscription*, not when `next.handle()` is called, so
    // the AsyncLocalStorage store has to wrap `subscribe` — wrapping `handle()`
    // alone would leave the store empty by the time the controller executes.
    // The version gate runs inside the store too, so a rejection still carries a
    // request id back to the client.
    return new Observable<unknown>((subscriber) =>
      runWithRequestContext(requestContext, () => {
        try {
          assertClientSupported(clientVersion);
        } catch (error) {
          subscriber.error(error);
          return undefined;
        }
        return next.handle().subscribe(subscriber);
      }),
    );
  }
}

/** `patches.v1.SystemService/GetServerInfo`, falling back to Nest class/handler names. */
function rpcPath(context: ExecutionContext): string {
  const call: unknown = context.getArgByIndex(2);
  if (typeof call === 'object' && call !== null && 'getPath' in call) {
    const getPath = (call as { getPath: () => string }).getPath;
    if (typeof getPath === 'function') return getPath.call(call).replace(/^\//, '');
  }
  return `${context.getClass().name}/${context.getHandler().name}`;
}

/**
 * Reject clients that are too old to interoperate (spec §83).
 *
 * Deliberately lenient about an *absent* version: grpcurl, load balancers and
 * health probes have no Patches build number and must still be able to reach the
 * server. A version that is present but unparseable is a client bug and is
 * rejected loudly rather than silently treated as "new enough".
 */
export function assertClientSupported(clientVersion: string | undefined): void {
  if (clientVersion === undefined) return;

  const parsed = parseSemver(clientVersion);
  if (parsed === undefined) {
    throw new AppError(
      'CLIENT_VERSION_UNSUPPORTED',
      `This server could not understand the client version "${clientVersion}". ` +
        `Expected a semantic version such as ${MIN_CLIENT_VERSION}.`,
    );
  }

  if (MIN_CLIENT_SEMVER !== undefined && compareSemver(parsed, MIN_CLIENT_SEMVER) < 0) {
    throw new AppError(
      'CLIENT_VERSION_UNSUPPORTED',
      `This Patches client (${clientVersion}) is too old for this server, which requires ` +
        `${MIN_CLIENT_VERSION} or newer. Upgrade with: npm install -g patches@latest`,
    );
  }
}

/**
 * Validate/cap the inbound `x-request-id` (spec §103): anything absent, oversized, or
 * outside `[A-Za-z0-9._-]` is replaced with a freshly generated id rather than trusted
 * as-is — it is never safe to log or echo a caller-supplied value unchecked.
 */
export function sanitizeRequestId(raw: string | undefined): string {
  if (raw !== undefined && REQUEST_ID_PATTERN.test(raw)) return raw;
  return randomUUID();
}

function readMetadata(metadata: Metadata | undefined, key: string): string | undefined {
  const value = metadata?.get(key)[0];
  if (value === undefined) return undefined;
  const text = typeof value === 'string' ? value : value.toString('utf8');
  const trimmed = text.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

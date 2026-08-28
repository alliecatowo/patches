import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { RpcException } from '@nestjs/microservices';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { rpcDuration, readRpcPollTotal } from '@patches/observability/metrics';

import { getRequestContext } from '../context/request-context.js';
import { classifyRpc } from '../rate-limit/rpc-budget.js';

interface GrpcMethodInfo {
  method: string;
  service: string;
}

/**
 * ADR 0032 T2: the fixed, two-member allowlist of `read`-classified RPCs this node considers
 * "DM/notification polling" — the mailbox envelope poll and the unread-badge poll named in the
 * ADR's freshness table. Deliberately a closed set of method names, not derived from any
 * request field, so `readRpcPollTotal`'s `is_dm_poll` label stays bounded to two values.
 */
const DM_POLL_METHODS: ReadonlySet<string> = new Set(['ListMailboxEnvelopes', 'GetUnreadCount']);

@Injectable()
export class RpcMetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const grpcMethod = context.getArgByIndex<GrpcMethodInfo | undefined>(1);
    const methodName = grpcMethod?.method ?? 'unknown';

    // Same fully-qualified `Service/Method` source RpcBudgetInterceptor already classifies
    // budgets from (`patches.v1.<Service>/<Method>`, falling back the same way it does when
    // RequestContextInterceptor hasn't run — e.g. a bare unit test of this interceptor). Guarded
    // to actual gRPC calls only (`RpcBudgetInterceptor`'s own bypass) — this interceptor is also
    // registered globally over the HTTP federation surface, which has no RPC read/write shape.
    if (context.getType() === 'rpc') {
      const requestContext = getRequestContext();
      const rpc = requestContext?.rpc ?? `${context.getClass().name}/${context.getHandler().name}`;
      if (classifyRpc(rpc) === 'read') {
        const method = rpc.split('/')[1] ?? rpc;
        readRpcPollTotal.inc({ is_dm_poll: DM_POLL_METHODS.has(method) ? 'true' : 'false' });
      }
    }

    const start = process.hrtime.bigint();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Number(process.hrtime.bigint() - start) / 1e9;
          rpcDuration.observe({ method: methodName, status: 'ok' }, duration);
        },
        error: (error: unknown) => {
          const duration = Number(process.hrtime.bigint() - start) / 1e9;
          let status = 'error';
          if (error instanceof RpcException) {
            const grpcError = error.getError() as { code?: number } | undefined;
            if (grpcError?.code !== undefined) {
              status = GrpcStatus[grpcError.code] ?? 'error';
            }
          }
          rpcDuration.observe({ method: methodName, status }, duration);
        },
      }),
    );
  }
}

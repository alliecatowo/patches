import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { RpcException } from '@nestjs/microservices';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { rpcDuration } from '@patches/observability/metrics';

interface GrpcMethodInfo {
  method: string;
  service: string;
}

@Injectable()
export class RpcMetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const grpcMethod = context.getArgByIndex(1) as GrpcMethodInfo | undefined;
    const methodName = grpcMethod?.method ?? 'unknown';

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

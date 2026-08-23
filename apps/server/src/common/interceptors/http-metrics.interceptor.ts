import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request, Response } from 'express';
import { httpDuration, httpRequestsTotal } from '@patches/observability/metrics';

type ExpressRequestWithRoute = Request & { route?: { path: string } | null };

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<ExpressRequestWithRoute>();
    const method = req.method;
    const route = req.route as { path: string } | undefined;
    const path = route?.path ?? req.path ?? 'unknown';

    const start = process.hrtime.bigint();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse<Response>();
          const status = res.statusCode?.toString() ?? '200';
          const duration = Number(process.hrtime.bigint() - start) / 1e9;
          httpDuration.observe({ method, path, status }, duration);
          httpRequestsTotal.inc({ method, path, status });
        },
        error: () => {
          const res = context.switchToHttp().getResponse<Response>();
          const status = res.statusCode?.toString() ?? '500';
          const duration = Number(process.hrtime.bigint() - start) / 1e9;
          httpDuration.observe({ method, path, status }, duration);
          httpRequestsTotal.inc({ method, path, status });
        },
      }),
    );
  }
}

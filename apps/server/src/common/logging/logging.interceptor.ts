import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { type Observable, tap } from 'rxjs';

import { getRequestContext } from '../context/request-context.js';
import { isAppError } from '../errors/app-error.js';

/**
 * One log line per RPC: method, latency, outcome (spec §98).
 *
 * The `authorization` metadata key is never read here, so a bearer token cannot
 * leak into the log stream by accident.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Rpc');

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = process.hrtime.bigint();

    return next.handle().pipe(
      tap({
        next: () => {
          this.log('rpc.ok', startedAt, 'ok');
        },
        error: (error: unknown) => {
          this.log('rpc.failed', startedAt, isAppError(error) ? error.code : 'unhandled');
        },
      }),
    );
  }

  private log(msg: string, startedAt: bigint, outcome: string): void {
    const context = getRequestContext();
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    this.logger.log({
      msg,
      rpc: context?.rpc,
      requestId: context?.requestId,
      client: context?.client,
      clientVersion: context?.clientVersion,
      outcome,
      durationMs: Math.round(durationMs * 100) / 100,
    });
  }
}

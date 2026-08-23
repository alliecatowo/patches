import { type Metadata } from '@grpc/grpc-js';
import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { catchError, finalize, Observable, throwError, timeout, TimeoutError } from 'rxjs';
import type { DataSource } from 'typeorm';

import { getSessionClaims } from '../../modules/auth/session-context.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { DATA_SOURCE } from '../../database/database.module.js';
import { getRequestContext } from '../context/request-context.js';
import { AppError } from '../errors/app-error.js';
import {
  classifyRpc,
  ConcurrencyGate,
  RpcBudgetLimiter,
  DbRpcBudgetLimiter,
  type RpcClass,
  createRpcBudgetLimiter,
} from '../rate-limit/rpc-budget.js';

/**
 * S-001/S-002 (`docs/operations/capacity.md`): the general-purpose per-RPC-class cost budget,
 * write-concurrency load-shedding gate, and server-side call deadline, applied to every RPC —
 * on top of, never instead of, the narrower sensitive-flow limiters (`RateLimitService`,
 * `ReportRateLimitService`) those specific write paths already call directly.
 *
 * Registered as a global `APP_INTERCEPTOR` (`app.module.ts`), **after**
 * `RequestContextInterceptor`: guards (including `AuthGuard`, wherever a route attaches it)
 * always run before any interceptor (Nest's fixed pipeline order), so by the time this
 * interceptor's `intercept` runs, an authenticated call already has its claims stored via
 * `setSessionClaims` — {@link currentActorId} below just reads them back out. Registration
 * order relative to `RequestContextInterceptor` matters too: `getRequestContext()` is only
 * populated once that interceptor's own `subscribe`-time `runWithRequestContext` call has
 * happened, which requires it to be the *outer* interceptor.
 */
@Injectable()
export class RpcBudgetInterceptor implements NestInterceptor {
  private readonly peerLimiters: Record<RpcClass, RpcBudgetLimiter | DbRpcBudgetLimiter>;
  private readonly actorLimiters: Record<RpcClass, RpcBudgetLimiter | DbRpcBudgetLimiter>;
  private readonly writeGate: ConcurrencyGate;
  private readonly rpcTimeoutMs: number;
  private readonly useDb: boolean;
  private readonly dataSource: DataSource;

  constructor(config: AppConfigService, @Inject(DATA_SOURCE) dataSource: DataSource) {
    this.useDb = config.rateLimitGlobal;
    this.dataSource = dataSource;
    const windowMs = 60_000;
    this.peerLimiters = {
      read: createRpcBudgetLimiter(dataSource, this.useDb, {
        limit: config.rpcReadBudgetPerPeerPerMin,
        windowMs,
      }),
      write: createRpcBudgetLimiter(dataSource, this.useDb, {
        limit: config.rpcWriteBudgetPerPeerPerMin,
        windowMs,
      }),
      search: createRpcBudgetLimiter(dataSource, this.useDb, {
        limit: config.rpcSearchBudgetPerPeerPerMin,
        windowMs,
      }),
    };
    this.actorLimiters = {
      read: createRpcBudgetLimiter(dataSource, this.useDb, {
        limit: config.rpcReadBudgetPerActorPerMin,
        windowMs,
      }),
      write: createRpcBudgetLimiter(dataSource, this.useDb, {
        limit: config.rpcWriteBudgetPerActorPerMin,
        windowMs,
      }),
      search: createRpcBudgetLimiter(dataSource, this.useDb, {
        limit: config.rpcSearchBudgetPerActorPerMin,
        windowMs,
      }),
    };
    this.writeGate = new ConcurrencyGate(config.rpcWriteConcurrencyLimit);
    this.rpcTimeoutMs = config.rpcTimeoutMs;
  }

  /** Clear process-local budget buckets for an in-process test server. */
  resetBudgets(): void {
    for (const limiter of Object.values(this.peerLimiters)) {
      if ('clear' in limiter) limiter.clear();
    }
    for (const limiter of Object.values(this.actorLimiters)) {
      if ('clear' in limiter) limiter.clear();
    }
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // P8-001..008/A-039: the federation HTTP surface and `/healthz` share this global
    // interceptor with every gRPC RPC — same non-`rpc` bypass every other global interceptor
    // in this codebase uses (`RequestContextInterceptor`, `PublicReadGuard`).
    if (context.getType() !== 'rpc') return next.handle();

    const requestContext = getRequestContext();
    const rpc = requestContext?.rpc ?? `${context.getClass().name}/${context.getHandler().name}`;
    const rpcClass = classifyRpc(rpc);
    const peerKey = requestContext?.peer ?? 'unknown';
    const actorId = currentActorId(context);

    const peerLimiter = this.peerLimiters[rpcClass];
    const actorLimiter = this.actorLimiters[rpcClass];

    let releaseWriteGate: (() => void) | undefined;
    if (rpcClass === 'write') {
      if (!this.writeGate.tryAcquire()) {
        throw new AppError(
          'NODE_OVERLOADED',
          'This node is under heavy write load right now. Reads are unaffected — please retry ' +
            'this action shortly.',
          { context: { rpc } },
        );
      }
      releaseWriteGate = () => {
        this.writeGate.release();
      };
    }

    // Run the async budget check before the handler executes
    return new Observable((subscriber) => {
      void (async () => {
        try {
          if (!(await peerLimiter.tryConsume(peerKey))) throw budgetExceeded(rpcClass);
          if (actorId !== undefined && !(await actorLimiter.tryConsume(actorId))) {
            throw budgetExceeded(rpcClass);
          }

          const source = next.handle().pipe(
            timeout(this.rpcTimeoutMs),
            catchError((error: unknown) =>
              throwError(() =>
                error instanceof TimeoutError
                  ? new AppError('RPC_TIMEOUT', 'This request took too long and was abandoned.', {
                      context: { rpc },
                    })
                  : error,
              ),
            ),
            releaseWriteGate === undefined ? finalize(() => undefined) : finalize(releaseWriteGate),
          );

          source.subscribe(subscriber);
        } catch (error) {
          if (releaseWriteGate !== undefined) releaseWriteGate();
          subscriber.error(error);
        }
      })();
    });
  }
}

function budgetExceeded(rpcClass: RpcClass): AppError {
  return new AppError('RATE_LIMITED', `Too many ${rpcClass} requests. Try again in a minute.`, {
    context: { rpcClass },
  });
}

/** `undefined` for an unauthenticated call, or one whose route has no `AuthGuard` — this
 * interceptor still applies the peer-keyed budget either way, just not an actor-keyed one. */
function currentActorId(context: ExecutionContext): string | undefined {
  try {
    const call = context.switchToRpc().getContext<Metadata>();
    return getSessionClaims(call)?.actorId;
  } catch {
    // No gRPC metadata context available (e.g. a non-standard test double) — treat as
    // anonymous rather than fail the request over a budget-tracking convenience.
    return undefined;
  }
}

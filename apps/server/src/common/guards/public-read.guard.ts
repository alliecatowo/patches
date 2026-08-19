import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service.js';
import { AuthGuard } from '../../modules/auth/auth.guard.js';
import { AppError, isAppError } from '../errors/app-error.js';

/**
 * Global gRPC gate for `PUBLIC_READ=false` (owner decision, 2026-08-19): an invite-only node
 * gates *posting*, not *reading*, by default — `INVITE_ONLY` never touches this guard.
 * `PUBLIC_READ` defaults `true`, so every RPC that is normally anonymous-readable
 * (`FeedController.listLocalFeed`, `ActorController.getActor`, …) stays open with this guard
 * a no-op. An operator who wants a fully closed node sets `PUBLIC_READ=false`, which makes
 * *every* RPC require an authenticated session except:
 *
 * - `SystemService.*`, `NodeService.GetNodeInfo`/`GetNodePolicy` — a client must be able to
 *   discover this node's policy (spec §163, §168) before it can even know sign-in is
 *   required;
 * - `AuthService.*` — you cannot sign in while already required to be signed in;
 * - anything that is not a gRPC call at all. `/healthz` and the federation HTTP surface
 *   (`FederationHttpModule`) are Nest HTTP routes, not `rpc` execution contexts, so
 *   `context.getType() !== 'rpc'` already excludes them without a separate allow-list entry
 *   (the same check `RequestContextInterceptor` uses for the same reason).
 *
 * Registered as a global `APP_GUARD` (`app.module.ts`) rather than attached per-controller —
 * a central allow-list here keeps every controller a thin transport adapter (spec §128)
 * instead of every anonymous-readable RPC growing its own "unless PUBLIC_READ" branch.
 *
 * The actual authentication check reuses `AuthGuard` itself (same `AUTH_SESSION_EXPIRED`/
 * `ACCOUNT_SUSPENDED` handling an explicitly `@UseGuards(AuthGuard)` RPC already gets, and the
 * same `setSessionClaims` side effect downstream code may rely on), wrapped so a missing or
 * invalid token surfaces the friendlier, `PUBLIC_READ`-specific `SIGN_IN_REQUIRED` instead of
 * `AUTH_INVALID_CREDENTIALS`/`AUTH_SESSION_EXPIRED` — a client needs to tell "this node
 * requires sign-in to read" apart from "your credentials were wrong" (the latter implies a
 * login form was already shown). `ACCOUNT_SUSPENDED` is left to surface as-is: a suspended
 * account is not told to "sign in", it already is signed in.
 *
 * Runs before any method-level `@UseGuards(AuthGuard)` (Nest executes global guards first), so
 * an RPC that already always requires auth (e.g. `PostController.createPost`) also reports
 * `SIGN_IN_REQUIRED` instead of its usual code when called with no/invalid token on a closed
 * node — a deliberate simplification (the caller still needs to authenticate either way) that
 * avoids this guard having to know which RPCs are "normally" anonymous-readable.
 */
const ALLOWED_WHEN_CLOSED: readonly RegExp[] = [
  /^patches\.v1\.SystemService\//,
  /^patches\.v1\.AuthService\//,
  /^patches\.v1\.NodeService\/GetNodeInfo$/,
  /^patches\.v1\.NodeService\/GetNodePolicy$/,
  // Fallback controller/handler names for anything that reaches this guard without a real
  // grpc-js call object exposing `getPath()` (e.g. a differently-wired test double) — same
  // fallback pairing `RequestContextInterceptor`'s own `rpcPath` uses.
  /^SystemController\//,
  /^AuthController\//,
  /^NodeController\/getNodeInfo$/,
  /^NodeController\/getNodePolicy$/,
];

@Injectable()
export class PublicReadGuard implements CanActivate {
  constructor(
    private readonly config: AppConfigService,
    private readonly authGuard: AuthGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'rpc') return true; // /healthz, federation HTTP surface
    if (this.config.publicRead) return true;

    const path = rpcPath(context);
    if (ALLOWED_WHEN_CLOSED.some((pattern) => pattern.test(path))) return true;

    try {
      return await this.authGuard.canActivate(context);
    } catch (error) {
      if (isAppError(error) && error.code === 'ACCOUNT_SUSPENDED') throw error;
      throw new AppError('SIGN_IN_REQUIRED', 'This node requires sign-in to read.');
    }
  }
}

/** `patches.v1.SystemService/GetServerInfo`, falling back to Nest class/handler names — the
 * same two-step lookup `RequestContextInterceptor`'s own `rpcPath` uses, duplicated here since
 * that helper is not exported and this guard needs no other part of that module. */
function rpcPath(context: ExecutionContext): string {
  const call: unknown = context.getArgByIndex(2);
  if (typeof call === 'object' && call !== null && 'getPath' in call) {
    const getPath = (call as { getPath: () => string }).getPath;
    if (typeof getPath === 'function') return getPath.call(call).replace(/^\//, '');
  }
  return `${context.getClass().name}/${context.getHandler().name}`;
}

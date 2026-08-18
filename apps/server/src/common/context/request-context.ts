import { AsyncLocalStorage } from 'node:async_hooks';

/** Per-RPC correlation data, populated by `RequestContextInterceptor`. */
export interface RequestContext {
  /** From `x-request-id` metadata, or generated when the client omits it. */
  readonly requestId: string;
  /** From `x-patches-client` metadata, e.g. `tui`. */
  readonly client: string | undefined;
  /** From `x-patches-client-version` metadata. */
  readonly clientVersion: string | undefined;
  /** Fully-qualified RPC, e.g. `patches.v1.SystemService/GetServerInfo`. */
  readonly rpc: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * The current request's context, or `undefined` outside an RPC.
 *
 * Callers must tolerate `undefined` — this is a convenience for logging, never a
 * substitute for passing data explicitly through service arguments.
 */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

import { createClient, type CallOptions, type Client, type Transport } from '@connectrpc/connect';
import { type DescService } from '@bufbuild/protobuf';
import {
  ActorService,
  AuthService,
  CommunityService,
  DirectMessageService,
  FeedService,
  MediaService,
  ModerationService,
  NodeService,
  NotificationService,
  PageService,
  PostService,
  ReactionService,
  SocialGraphService,
  SystemService,
  TagService,
} from '@patches/proto/es';

import { SessionManager, type CredentialStore } from './session.js';

/** Default call deadlines in milliseconds — mirrors `@patches/proto`'s `DEADLINES_MS`
 * (which is only exported alongside ts-proto/grpc-js types, so it can't be imported
 * into this transport-agnostic package without dragging that dependency in). */
const UNARY_DEADLINE_MS = 10_000;
const AUTH_DEADLINE_MS = 15_000;

/** `x-request-id`/`x-patches-client`/`x-patches-client-version` (spec §44) — mirrors
 * `@patches/proto`'s `METADATA_KEYS`, restated for the same reason as the deadlines above. */
const METADATA_KEYS = Object.freeze({
  requestId: 'x-request-id',
  client: 'x-patches-client',
  clientVersion: 'x-patches-client-version',
});

export interface CreatePatchesApiOptions {
  /** A Connect `Transport` — build one with `@patches/client/connect` (web/RN) or
   * `@patches/client/grpc` (Node/TUI). */
  readonly transport: Transport;
  /** Sent as `x-patches-client` on every call. */
  readonly clientName: string;
  /** Sent as `x-patches-client-version` on every call. */
  readonly clientVersion: string;
  readonly credentialStore?: CredentialStore;
}

export interface PatchesApi {
  readonly system: Client<typeof SystemService>;
  readonly auth: Client<typeof AuthService>;
  readonly actors: Client<typeof ActorService>;
  readonly socialGraph: Client<typeof SocialGraphService>;
  readonly posts: Client<typeof PostService>;
  readonly feeds: Client<typeof FeedService>;
  readonly reactions: Client<typeof ReactionService>;
  readonly notifications: Client<typeof NotificationService>;
  readonly moderation: Client<typeof ModerationService>;
  readonly media: Client<typeof MediaService>;
  readonly pages: Client<typeof PageService>;
  readonly node: Client<typeof NodeService>;
  readonly tags: Client<typeof TagService>;
  readonly communities: Client<typeof CommunityService>;
  readonly messages: Client<typeof DirectMessageService>;
  readonly session: SessionManager;
}

/**
 * Builds every `patches.v1` service client on one transport, plus a `SessionManager`.
 *
 * Per ADR 0016 §9, `createClient(Service, transport)` from `@connectrpc/connect` already
 * generates every RPC method mechanically from the service descriptor — nothing here
 * hand-writes a wrapper per RPC (66 across the schema). What this function adds on top,
 * uniformly, for every one of those generated methods:
 *  - `x-request-id` (fresh per call), `x-patches-client`, `x-patches-client-version`
 *  - a default deadline (`DEADLINES_MS.auth` for `AuthService`, `.unary` for everything
 *    else — matches `apps/tui/src/api/client.ts`'s own per-service choice), applied only
 *    when the caller didn't already set `timeoutMs`
 *
 * The auth header is deliberately *not* added here — see `SessionManager.withSession`'s
 * doc comment for why only the caller can decide which calls need it.
 */
export function createPatchesApi(options: CreatePatchesApiOptions): PatchesApi {
  const bind = <T extends DescService>(service: T, deadlineMs: number): Client<T> =>
    bindService(service, options.transport, deadlineMs, options.clientName, options.clientVersion);

  return {
    system: bind(SystemService, UNARY_DEADLINE_MS),
    auth: bind(AuthService, AUTH_DEADLINE_MS),
    actors: bind(ActorService, UNARY_DEADLINE_MS),
    socialGraph: bind(SocialGraphService, UNARY_DEADLINE_MS),
    posts: bind(PostService, UNARY_DEADLINE_MS),
    feeds: bind(FeedService, UNARY_DEADLINE_MS),
    reactions: bind(ReactionService, UNARY_DEADLINE_MS),
    notifications: bind(NotificationService, UNARY_DEADLINE_MS),
    moderation: bind(ModerationService, UNARY_DEADLINE_MS),
    media: bind(MediaService, UNARY_DEADLINE_MS),
    pages: bind(PageService, UNARY_DEADLINE_MS),
    node: bind(NodeService, UNARY_DEADLINE_MS),
    tags: bind(TagService, UNARY_DEADLINE_MS),
    communities: bind(CommunityService, UNARY_DEADLINE_MS),
    messages: bind(DirectMessageService, UNARY_DEADLINE_MS),
    session: new SessionManager(
      options.credentialStore === undefined
        ? { transport: options.transport }
        : { transport: options.transport, credentialStore: options.credentialStore },
    ),
  };
}

/**
 * Wraps a generated Connect client so every method gets a fresh request ID, the client
 * identity headers, and a default deadline before the underlying call runs.
 *
 * `createClient`'s method map is built dynamically from `service.method` (one function
 * per RPC, `Client<T>` is a mapped type) — there is no fixed set of keys to hand-write a
 * pass-through for. A `Proxy` is the only way to inject the same three lines of logic in
 * front of all of them without enumerating the 66 RPCs by hand; the `as Client<T>` cast
 * is required because a `Proxy` is only ever known to `object` at the type level. This
 * mirrors ADR 0016 §3's own "one contained cast, carrying a justification comment"
 * precedent for the server-side generic proxy.
 */
function bindService<T extends DescService>(
  service: T,
  transport: Transport,
  deadlineMs: number,
  clientName: string,
  clientVersion: string,
): Client<T> {
  const client: object = createClient(service, transport);
  const handler: ProxyHandler<object> = {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;
      const method = value as (request: unknown, callOptions?: CallOptions) => unknown;
      return (request: unknown, callOptions?: CallOptions) => {
        const headers = new Headers(callOptions?.headers);
        headers.set(METADATA_KEYS.requestId, crypto.randomUUID());
        headers.set(METADATA_KEYS.client, clientName);
        headers.set(METADATA_KEYS.clientVersion, clientVersion);
        return method(request, {
          timeoutMs: deadlineMs,
          ...callOptions,
          headers,
        });
      };
    },
  };
  return new Proxy(client, handler) as Client<T>;
}

# @patches/client

Transport-agnostic Patches SDK (ADR 0016 §9). One `PatchesApi` over
`@bufbuild/protobuf-es` types, shared by the web app, React Native, and (eventually) the
TUI. Two transport entry points so a browser bundle never sees Node-only code:
`@patches/client/connect` (fetch, web + RN) and `@patches/client/grpc` (grpc-js/http2,
Node only).

```ts
// Web (browser), via Connect over HTTPS:
import { createConnectTransport } from '@patches/client/connect';
import { createPatchesApi } from '@patches/client';

const transport = createConnectTransport({ baseUrl: 'https://patches-social.fly.dev:8443' });
const api = createPatchesApi({ transport, clientName: 'web', clientVersion: '0.1.0' });

const { server } = await api.system.getServerInfo({});

// Anonymous read — no session required (spec §51):
const { post } = await api.posts.getPost({ postId: '...' });

// Authed call — the caller decides which calls carry the access token, and
// `withSession` retries once on an expired token (refreshing via AuthService):
const { post: created } = await api.session.withSession((accessToken) =>
  api.posts.createPost({ body: 'hello' }, { headers: { authorization: `Bearer ${accessToken}` } }),
);

// Cursor pagination (spec §46 — never offset):
for await (const post of paginate(
  (cursor, limit) => api.feeds.listLocalFeed({ cursor, limit }),
  (response) => response.posts,
)) {
  console.log(post.body);
}
```

Node/TUI, via gRPC:

```ts
import { createGrpcTransport } from '@patches/client/grpc';
import { createPatchesApi } from '@patches/client';

const transport = createGrpcTransport({ baseUrl: 'https://patches-social.fly.dev' });
const api = createPatchesApi({ transport, clientName: 'tui', clientVersion: '0.1.0' });
```

`api.<service>` exposes every RPC on that service as a typed method (`api.posts`,
`api.feeds`, `api.auth`, `api.actors`, `api.socialGraph`, `api.reactions`,
`api.notifications`, `api.moderation`, `api.media`, `api.pages`, `api.node`, `api.tags`,
`api.communities`, `api.messages`, `api.system`) — generated mechanically by
`@connectrpc/connect`'s `createClient` from the service descriptor, so adding an RPC to a
`.proto` needs no change here. Every call gets a fresh `x-request-id`, the
`x-patches-client`/`x-patches-client-version` headers, and a default deadline
automatically; pass `CallOptions` (`{ headers, timeoutMs, signal }`) as the method's
second argument to override any of that per call.

`describeError(err)` turns any thrown value (a `ConnectError` or otherwise) into
`{ code, message, retryable }` — the same user-facing copy `apps/tui` has always shown,
ported so web/RN show identical copy for identical failures.

A `CredentialStore` is how a session gets persisted; this package ships only
`InMemoryCredentialStore` (loses the session at process exit — fine for tests/short
scripts). Real clients implement the three-method interface themselves: the web app
against `localStorage` keyed by node origin, RN against `expo-secure-store`, matching
ADR 0016 §5's token-binding rule (a token is bound to the node that issued it and must
never be sent anywhere else).

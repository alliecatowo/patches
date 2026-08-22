# Model Context Protocol (MCP) — Patches MCP-01

**Verified:** 2026-08-22. **Scope:** finalized MCP protocol revision
`2026-07-28`, its released TypeScript SDK v2 packages, and the OAuth standards
they normatively use. This note uses only primary sources (the MCP
specification/source repository, the npm registry maintained by npm, and IETF
RFCs/drafts).

## Version and package baseline

### Documented facts

- The current Patches server is NestJS on the Express platform
  ([`apps/server/package.json`](../../apps/server/package.json)); it has no MCP
  SDK dependency yet. Patches is pinned to Node 24 and TypeScript `^5.9.3`
  ([toolchain catalog](../../pnpm-workspace.yaml)).
- On 2026-08-22, npm's `latest` tag resolves each released SDK v2 package below
  to **`2.0.0`**: [`@modelcontextprotocol/server`](https://www.npmjs.com/package/@modelcontextprotocol/server/v/2.0.0),
  [`@modelcontextprotocol/client`](https://www.npmjs.com/package/@modelcontextprotocol/client/v/2.0.0),
  [`@modelcontextprotocol/core`](https://www.npmjs.com/package/@modelcontextprotocol/core/v/2.0.0),
  [`@modelcontextprotocol/node`](https://www.npmjs.com/package/@modelcontextprotocol/node/v/2.0.0),
  and [`@modelcontextprotocol/express`](https://www.npmjs.com/package/@modelcontextprotocol/express/v/2.0.0).
  The server package declares Node `>=20`, so Patches' Node 24 satisfies it.
- `@modelcontextprotocol/server` exports `McpServer` and
  `createMcpHandler`. The latter creates a web-standard `McpHttpHandler` with
  `fetch`, `close`, `notify`, and `bus`; the Node adapter exports
  `toNodeHandler(handler)` for Node/Express-shaped request handling. The
  released declarations document the exact surface and the per-request server
  factory model ([server v2.0.0 package artifact](https://registry.npmjs.org/@modelcontextprotocol/server/-/server-2.0.0.tgz),
  [Node v2.0.0 package artifact](https://registry.npmjs.org/@modelcontextprotocol/node/-/node-2.0.0.tgz)).
- The `@modelcontextprotocol/express` package is an optional thin adapter. It
  supplies Express app/Origin/Host guards and resource-server middleware;
  it does not implement MCP itself ([v2.0.0 package README](https://registry.npmjs.org/@modelcontextprotocol/express/-/express-2.0.0.tgz)).

### Inferred: Patches package choice

- Use `@modelcontextprotocol/server@2.0.0` plus
  `@modelcontextprotocol/node@2.0.0` for the NestJS/Express host, using
  `createMcpHandler` and `toNodeHandler`. Do not select the legacy
  `NodeStreamableHTTPServerTransport` wiring for a new `2026-07-28` endpoint;
  it still documents session-oriented compatibility APIs.
- `@modelcontextprotocol/express` is not needed merely because Nest uses
  Express. Patches can put its own established authentication, rate limiting,
  Origin validation, and error policy in front of the Node adapter. Its
  resource-server helpers may be evaluated separately if their behavior and
  Patches' policy agree.

## Streamable HTTP — revision `2026-07-28`

### Documented facts

- The revision removes both the HTTP GET stream endpoint and protocol-level
  sessions. A server exposes one MCP endpoint supporting POST; every
  JSON-RPC request or notification is a separate POST. A request response is
  either one JSON object or an SSE stream scoped to that request
  ([Streamable HTTP overview](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)).
- Clients must send `Accept` containing both `application/json` and
  `text/event-stream`; request notifications receive `202` with no body; a
  request receives JSON or SSE. `notifications/cancelled` is **not** sent over
  Streamable HTTP: closing that request's SSE response stream is cancellation
  ([sending messages](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)).
- Each POST must carry `MCP-Protocol-Version: 2026-07-28`, matching the
  body `_meta.io.modelcontextprotocol/protocolVersion`; a mismatch is a 400.
  `Mcp-Method` is required for all requests and `Mcp-Name` for `tools/call`,
  `resources/read`, and `prompts/get` ([request metadata](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)).
- The server must validate an incoming `Origin` header and reject an invalid
  one with 403. Local servers should bind loopback, and servers should
  authenticate connections ([security and endpoint requirements](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)).
- Server-to-client sampling, elicitation, and roots are no longer
  server-originated JSON-RPC requests. They use multi-round-trip input-required
  results. `Last-Event-ID`/resumable SSE is not supported
  ([receiving messages and subscriptions](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)).

### Inferred: Patches transport posture

- Make a new HTTPS `/mcp` endpoint modern-only (`legacy: 'reject'` in the SDK)
  unless Patches explicitly decides to support pre-2026 clients. Do not retain
  a GET/DELETE/session route by accident. This avoids silently reviving the
  assumptions removed by the finalized protocol.
- Validate Origin before the MCP handler and allow only Patches-controlled
  origins. Treat CORS configuration as distinct from this mandatory Origin
  check. Bound HTTP/SSE body sizes, per-principal and per-IP rate limits, and
  request duration in the host because the protocol does not provide those
  operational limits.
- Do not expose sensitive tool arguments through `x-mcp-header`: the
  specification says such headers are visible to intermediaries and explicitly
  warns against passwords, API keys, tokens, and PII
  ([tool header security](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)).

## `subscriptions/listen` and SDK v2 change delivery

### Documented facts

- Long-lived change notifications are delivered only on the SSE response
  stream of a client `subscriptions/listen` request. They are not an
  independent server-initiated stream; request-scoped progress/logging
  notifications do not belong there
  ([Streamable HTTP subscription behavior](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)).
- A tools server declaring `tools.listChanged` should send
  `notifications/tools/list_changed` only to clients that opened a listen
  stream with `toolsListChanged: true`. The visible tool set may vary by the
  authorization on each request, and tool lists should be deterministic
  ([tools capabilities](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)).
- SDK v2's `createMcpHandler` takes a factory and constructs a fresh server for
  each HTTP request. Its factory receives a modern/legacy era plus pass-through
  `authInfo`; the handler **does not** obtain or verify tokens from request
  headers. For `subscriptions/listen`, the handler provides a `ServerEventBus`
  and `handler.notify.toolsChanged()`, `promptsChanged()`,
  `resourcesChanged()`, and `resourceUpdated(uri)`. Defaults are an in-process
  bus, 1,024 open subscriptions, and 15-second SSE comment keepalives
  ([v2.0.0 handler declarations](https://registry.npmjs.org/@modelcontextprotocol/server/-/server-2.0.0.tgz),
  [official subscription example](https://github.com/modelcontextprotocol/typescript-sdk/tree/main/examples/subscriptions)).

### Inferred: Patches change delivery

- Start MCP-01 without dynamic tool/resource changes unless an actual Patches
  feature needs them. If introduced, publish only after authorization-aware
  filtering; an in-memory bus is insufficient once replicas exist, so a
  deliberate cross-instance event-bus design is then required.
- Keep the handler instance alive for application lifetime and call `close()`
  during process shutdown. The per-request factory means request data must not
  be stored in the `McpServer` instance as a session substitute.

## OAuth resource-server requirements

### Documented facts

- MCP authorization is optional. If HTTP authorization is supported, the MCP
  server is an OAuth resource server. It **must** implement OAuth Protected
  Resource Metadata (RFC 9728); clients must use it for authorization-server
  discovery. The protected-resource document must name at least one
  `authorization_servers` value
  ([MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization),
  [discovery requirements](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/authorization-server-discovery)).
- RFC 9728 defines discovery at `/.well-known/oauth-protected-resource` (with
  the resource path appended when the resource identifier has a path) and a
  `WWW-Authenticate` `resource_metadata` parameter for a 401 challenge
  ([RFC 9728 sections 3 and 5](https://www.rfc-editor.org/rfc/rfc9728.html)).
- MCP clients must send the RFC 8707 `resource` parameter in _both_
  authorization and token requests, using the canonical MCP server URI. MCP
  resource servers must validate that a token was issued for them; invalid or
  expired tokens get 401, and the server must not accept or pass through tokens
  intended for another resource
  ([MCP resource parameter and token handling](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization),
  [RFC 8707](https://www.rfc-editor.org/rfc/rfc8707.html)).
- MCP requires HTTPS for authorization-server endpoints and non-localhost
  redirect URIs; it requires PKCE validation, and public-client refresh tokens
  must rotate ([MCP authorization security considerations](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations)).

### Inferred: Patches authorization boundary

- Treat the complete `https://<Patches-origin>/mcp` URL as a stable, explicit
  OAuth resource identifier, publish RFC 9728 metadata for it, and validate
  issuer, signature, expiry, audience/resource, and Patches MCP scopes before
  calling the factory. Passing a verified principal as `authInfo` is the SDK's
  intended boundary; putting bearer-token parsing in a tool is not.
- Give MCP a separate audience and narrowly named scopes from the existing web
  session/API audience. The exact scope names and whether reads and writes are
  in MCP-01 are product/security decisions, not defined by MCP.

## CIMD (OAuth Client ID Metadata Documents)

### Documented facts

- MCP client registration prioritizes pre-registration, then Client ID
  Metadata Documents when advertised, then Dynamic Client Registration (DCR).
  MCP says CIMD support should be advertised via
  `client_id_metadata_document_supported`; it labels DCR deprecated and kept
  for backward compatibility
  ([MCP client registration](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration)).
- The current authoritative CIMD document is still an **active Internet-Draft**,
  [`draft-ietf-oauth-client-id-metadata-document-02`](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-02),
  dated 2026-07-06—not an RFC. It defines an HTTPS URL as `client_id` that
  resolves to client metadata. It forbids symmetric client-secret mechanisms
  and private key material in that document; the fetched `client_id` must
  exactly match its URL, redirects must not be automatically followed, and
  authorization servers must defend the fetch against SSRF.

### Discrepancy / training-data trap

- The finalized MCP page links the older CIMD draft `-00`, while the IETF's
  current working-group draft is `-02`. This is not a material conflict in
  MCP's direction, but it means CIMD remains changeable. Implementation must
  follow the current draft only after the chosen authorization server's support
  is verified; it must not treat CIMD as a final RFC.

### Inferred: Patches choice

- Patches is the resource server, not necessarily a public OAuth client.
  Therefore CIMD is not required to ship a protected `/mcp` endpoint. Defer it
  unless Patches also operates an authorization server that accepts arbitrary
  third-party MCP clients. If it is enabled, implement the draft's strict URL,
  redirect, response-size, cache, and SSRF rules—not an ad-hoc `client_id`
  fetcher.

## DPoP (RFC 9449)

### Documented facts

- DPoP is a finalized IETF standard, [RFC 9449](https://www.rfc-editor.org/rfc/rfc9449.html).
  It sender-constrains an access token to a public key. Each HTTP request has a
  unique signed `DPoP` proof JWT; the proof carries `jti`, `htm`, `htu`, and
  `iat`, and protected-resource use also requires `ath` (the access-token
  hash). The resource server verifies token/public-key binding, proof method
  and target URI, and `ath`.
- DPoP is not authentication or access control on its own. Proofs can be
  replayed at the same endpoint, so RFC 9449 requires limited proof lifetimes
  and describes `jti` replay tracking and server nonces
  ([RFC 9449 proof validation and replay](https://www.rfc-editor.org/rfc/rfc9449.html)).
- MCP 2026-07-28 does not name DPoP as a mandatory authorization mechanism;
  its authorization page specifies bearer-token use. RFC 9728 permits
  `resource_metadata` discovery with the DPoP authentication scheme, so DPoP
  can be an additive resource-server choice
  ([MCP token use](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization),
  [RFC 9728 compatibility](https://www.rfc-editor.org/rfc/rfc9728.html)).

### Inferred: Patches choice

- Do not claim DPoP protection unless Patches controls both its authorization
  server token issuance and resource-server validation. A DPoP rollout needs
  an explicit key-binding claim/token format, one proof per `/mcp` request,
  replay/nonce policy shared across replicas, and client-interoperability
  testing. Ordinary short-lived bearer tokens with strict audience/scope
  validation remain the compatible MCP baseline.

## Tool metadata and security

### Documented facts

- Tools are model-controlled. MCP says clients should keep a human able to
  deny invocations and should visually surface tools and calls. Servers must
  validate inputs, enforce access control, rate-limit calls, and sanitize
  outputs ([tools user interaction and security](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)).
- A tool definition has schemas and optional behavioral annotations. Clients
  **must consider annotations untrusted** unless the server is trusted
  ([tool definitions](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)).
  The maintained MCP tool-annotations guidance identifies `readOnlyHint`,
  `destructiveHint`, `idempotentHint`, and `openWorldHint` as hints rather than
  authorization enforcement ([official MCP guidance](https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/)).
- `tools/list` may return only tools allowed by the request's authorization;
  it must not vary by connection state. Structured output must conform to a
  declared `outputSchema` ([tools protocol and schemas](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)).

### Inferred: safe Patches tool posture

- Treat every tool result as model-visible data. Do not expose DM bodies,
  password/reset material, refresh/access tokens, private moderation evidence,
  or more account/profile data than the verified scope permits. Do not put such
  values into errors, telemetry, or tool descriptions.
- Expose a small authorization-filtered, deterministic tool list. Mark
  read-only tools accurately; label mutations conservatively, but enforce the
  actual permission and confirmation policy in Patches—not through annotations
  that a client can ignore or a server can misdescribe.
- Make output schemas and argument validation explicit; route tool execution
  through the same Patches application services/repositories as other
  transports. No TypeORM entity should become a tool result.

## Explicit unknowns before implementation

1. Which existing Patches issuer and signing-key mechanism will mint a distinct
   MCP audience, and what exact resource URI and scope taxonomy will it use?
2. Is MCP-01 read-only, or which mutating tools require a host confirmation
   and/or a Patches-side confirmation/approval record? MCP does not guarantee
   a client honors annotations or presents a confirmation UI.
3. Is `/mcp` a single-replica endpoint initially? If not, what bounded shared
   subscription/replay state is acceptable? The SDK's default event bus is
   process-local.
4. Will Patches operate an authorization server for arbitrary third-party MCP
   clients? Only that makes CIMD/DCR server support necessary.
5. Is sender-constrained DPoP required by the product threat model? MCP does
   not require it, and implementation needs a cross-replica replay policy.

## Breaking changes versus common assumptions

- Do not copy 2025 Streamable HTTP examples: 2026-07-28 has no GET stream,
  session identifier, or independent server-originated JSON-RPC requests.
- Do not use Dynamic Client Registration as the default current path; MCP
  deprecates it in favor of CIMD, whose current IETF draft is still mutable.
- Do not assume MCP SDK authentication helpers validate a request for
  `createMcpHandler`; authentication is deliberately host middleware.
- Do not treat annotations, OAuth client metadata, or DPoP proof possession as
  authorization by themselves.

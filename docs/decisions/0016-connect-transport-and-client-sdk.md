# 0016. Connect protocol for web/mobile clients, and a shared client SDK

**Status:** Accepted
**Date:** 2026-08-18

> **Later note (2026-08-25):** two factual premises below are stale. Line 18's "React Native's
> `fetch` is an XHR polyfill and **cannot stream** (connect-es#199)" and line 104's "No server
> streaming for browsers/RN" were both true when written and are no longer true: `connect-es#199`
> is closed, Expo SDK ≥52 ships a streaming `expo/fetch`, browsers support server-streaming, and
> `@connectrpc/connect-express` — the adapter this node actually uses — already serves Connect
> server-streaming over HTTP/1.1. This does not mean the decision was wrong when made; the rest of
> this ADR (unary-only edge, byte-level proxy, guards against streaming/`map`/`oneof`) stands.
> Verified in `docs/research/connect-streaming.md`; the correction is recorded in
> [0032](./0032-dm-delivery-stays-poll-based.md) (see "Correcting two stale premises in ADR
> 0016"). This body is left otherwise unedited, per this repo's convention that an ADR is a dated
> record.

## Context

Phase 10 adds a web client (P10-001) and a React Native client (P10-002). Browsers cannot speak
gRPC-over-HTTP/2 (no access to trailers or raw frames), so the existing transport — Nest gRPC on
`:50051`, ts-proto `nestJs=true` types serialized at runtime by `@grpc/proto-loader`, exposed on Fly
`:443` with `h2_backend` — is unreachable from a browser. §153 forbids GraphQL and tRPC, so the answer
must stay protobuf-schema-driven. Facts that shaped it (verified 2026-08-18):

- The schema has **66 unary RPCs across 13 services, zero streaming RPCs, no `oneof`, no `map`**.
- Connect-ES v2 dropped `protoc-gen-connect-es`; `@bufbuild/protoc-gen-es` v2 generates messages _and_
  service descriptors (connectrpc.com/docs/node). `@connectrpc/connect-express@2.1.2` (peer: express
  `^4.18.2 || ^5.0.1`) mounts a handler into an existing Express app.
- React Native's `fetch` is an XHR polyfill and **cannot stream** (connect-es#199). Unary works.
- Fly.io allows **one service per external port** and `:443` is already gRPC; Cloudflare proxies HTTPS
  on `443, 2053, 2083, 2087, 2096, 8443` (developers.cloudflare.com/fundamentals/reference/network-ports).
- The server's HTTP listener runs Nest's Express adapter **only when `FEDERATION_ENABLED`**, otherwise a
  standalone `/healthz` listener (`apps/server/src/main.ts`).
- Domain→protobuf mapping lives in per-module `*.mapper.ts` files producing proto-loader-shaped objects;
  auth, rate limiting and error mapping live in Nest guards, interceptors and `RpcExceptionsFilter`.

## Decision

1. **Connect protocol** (option (b)) is the web/mobile transport: same `.proto` files, no Envoy sidecar,
   HTTP/1.1 and HTTP/2, `fetch`-based in browsers and RN. gRPC stays the TUI's transport and the node's
   primary API.
2. **Second codegen, one schema.** `buf.gen.yaml` gains `protoc-gen-es` (v2, `target=ts`) emitting to
   `packages/proto/src/generated-es/`, exported as `@patches/proto/es`; ts-proto output stays server-only
   (`@patches/proto/nest`). The two families never meet in one process (see 3), so `stringEnums`/
   `forceLong`/`useDate` need no counterpart — protobuf-es keeps its canonical representation (numeric
   enums, `bigint` timestamp seconds) and `@patches/client` exposes helpers so app code never sees those.
3. **The Connect edge is a byte-level proxy, not a second controller layer.** A generic handler registers
   every service from its protobuf-es descriptor and forwards each call to the in-process gRPC server over
   loopback via `client.makeUnaryRequest` with identity serializers: protobuf-es decodes the Connect
   request (JSON or binary) and re-encodes it to protobuf binary, and those bytes reach grpc-js untouched.
   **No mapper, guard, rate limit or error mapping is duplicated** — the Connect path runs the same
   `AuthGuard`, interceptors and `RpcExceptionsFilter` as the TUI, and gRPC status codes map 1:1 onto
   Connect codes. Cost: one loopback hop and one extra encode/decode per call. The generic registration
   needs one contained cast, carrying a justification comment and a test that fails if a `.proto` ever
   introduces streaming, `map` or `oneof`.
4. **The HTTP listener becomes always-on**: Nest's Express adapter replaces the standalone healthz server,
   and the default surface is `/healthz` plus Connect at `/patches.v1.*`. This changes the "no HTTP surface
   unless federation" invariant deliberately — Connect exposes no capability gRPC on `:443` does not
   already expose. §176's intent is preserved by making `FederationModule` **conditionally registered** on
   `FEDERATION_ENABLED`, so webfinger/actor/inbox/outbox are absent, not merely unrouted, when federation
   is off. Registering that module unconditionally while listening is what this decision forbids.
5. **Auth is `authorization: Bearer <access token>`; cookies are never used** (no cookies ⇒ no CSRF
   surface and no `Access-Control-Allow-Credentials`). Refresh uses the same `AuthService` RPCs. Browser:
   access token in memory, refresh token in `localStorage` keyed by node origin, with rotation + reuse
   detection as the theft mitigation; RN: `expo-secure-store`. A token is bound to its issuing node origin
   and MUST NOT be sent anywhere else (§169).
6. **CORS**: a new `WEB_ORIGINS` env var (comma-separated allow-list, default empty = same-origin only)
   feeds `cors` from `@connectrpc/connect` for allowed/exposed headers; credentials mode stays off.
7. **Peer derivation reuses `TRUST_PROXY_HEADERS`**: Express `trust proxy` is set from it, and the proxy
   overwrites the `x-forwarded-for` metadata it forwards with the IP it derived, never passing a
   client-supplied value through. Only `authorization`, `user-agent`, `accept-language` and `x-request-id`
   are forwarded, so a browser cannot smuggle internal metadata.
8. **Deployment**: gRPC keeps Fly `:443 → 50051` unchanged; a second `[[services]]` exposes `:8443 → 8080`,
   fronted by Cloudflare on `:443` for the public web origin. Self-hosters put any reverse proxy in front
   of `HTTP_PORT`; nothing here requires Fly or Cloudflare.
9. **`packages/client` (`@patches/client`) is the transport-agnostic SDK**: a `PatchesApi` interface over
   protobuf-es types, `SessionManager` (15m access token + opaque refresh rotation, pluggable credential
   store), status-code → user-copy error mapping (moved from `apps/tui/src/api/errors.ts`), and cursor
   pagination helpers (§153: never offset). Two transports: `@patches/client/connect` (fetch; web + RN) and
   `@patches/client/grpc` (grpc-js, same binary passthrough; Node/TUI only, out of the browser entry).
10. **Web Pages rendering**: Pages v1 is inert data rendered same-origin by React components — §172's
    isolation requirement applies to the _advanced HTML/CSS mode_, which does not exist yet. If that is ever
    built it MUST use a dedicated origin (`pages.<domain>`/usercontent domain) with `script-src 'none'`
    **and** a `sandbox` iframe without `allow-same-origin`/`allow-scripts`. A same-origin iframe is not an
    acceptable substitute; that is the spec's rule, not this ADR's choice.

### Phases and acceptance

| Phase                      | Acceptance                                                                                                                                                                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Server edge (P10-004)   | `protoc-gen-es` output builds; the handler answers all 13 services; an integration test asserts one authed RPC, one anonymous RPC and one error behave identically over both transports; federation stays absent with `FEDERATION_ENABLED=false`; CORS preflight test |
| B. SDK (P10-003)           | `@patches/client` builds for browser and Node; `SessionManager` refresh/rotation and error-mapping tests pass without a network; the Connect transport hits a live server in an integration test                                                                      |
| C. Web read-only (P10-001) | `apps/web` renders public timeline, profile, thread and a Page against the live node with no auth code paths; the bundle contains no ts-proto or grpc-js                                                                                                              |
| D. Web auth + posting      | login/refresh/logout, compose, reactions, follow; no token in a cookie; rate-limit errors surface as user copy                                                                                                                                                        |
| E. RN (P10-002)            | Expo app: auth, home/local timelines, compose, notifications over Connect; unary-only verified on a device                                                                                                                                                            |
| F. TUI migration (P10-005) | TUI uses `@patches/client` + the grpc transport; `apps/tui/src/api/client.ts` shrinks to UI-facing wrappers; no behavior change                                                                                                                                       |

### New packages and directories

`packages/proto/src/generated-es/` (+ `@patches/proto/es` export), `apps/server/src/transport/connect/`
(`connect.middleware.ts`, `grpc-proxy.ts`, `cors.ts`), `packages/client/src/{api,session,errors,pagination,transport}`,
`apps/web` (Vite + React), `apps/mobile` (Expo). Config: `WEB_ORIGINS` in `packages/config` and
`apps/server/src/config/env.schema.ts` + `.env.example`; a second `[[services]]` block in `infra/fly/fly.toml`.

## Consequences

- One schema keeps serving every client, and adding an RPC still means editing one `.proto` — the Connect
  edge picks it up with no per-RPC work.
- Two codegens must stay in step: `pnpm proto:gen` emits two trees, CI checks both are current,
  `@bufbuild/protobuf` joins the dependency set, and generated output roughly doubles.
- The server gains an always-on HTTP listener — new surface at the port level even though it exposes no new
  capability; `/healthz` behavior and the federation gate must be re-tested.
- Every Connect call costs a loopback round trip and a re-encode. Acceptable for a read-mostly web client;
  if it ever isn't, the fix is native handlers for the hot services, not a rewrite.
- No server streaming for browsers/RN: irrelevant today, but adding a streaming RPC later means designing
  its non-streaming fallback in the same change.
- Refresh tokens in `localStorage` are XSS-exposed, so the web app must ship a strict CSP with no inline or
  third-party scripts and never render user HTML same-origin. The TUI is untouched until phase F.

## Alternatives considered

- **gRPC-Web via an Envoy sidecar on Fly** — a second process, config language and failure mode per node,
  making self-hosting materially harder for no capability we need.
- **Hand-written JSON/REST gateway controllers** — 66 endpoints that drift from the schema plus a
  hand-written client: the thing protobuf exists to prevent.
- **Per-RPC Connect handlers calling application services** — tidy under §128, but duplicates 66 mappers
  _and_ the guard/rate-limit wiring, where divergence is a silent authorization bug.
- **Moving gRPC off `:443` so Connect can have it** — breaks every existing TUI endpoint and routes the TUI
  through the proxy hop; Cloudflare on `:8443` costs nothing.
- **An SDK typed with ts-proto shapes** — forces a timestamp/enum/bytes conversion inside every client;
  protobuf-es types plus binary passthrough removes the conversion entirely.

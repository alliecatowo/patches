# MCP-01 — Model Context Protocol endpoint architecture

MCP-01 (issues [#220](https://github.com/alliecatowo/patches/issues/220),
[#159](https://github.com/alliecatowo/patches/issues/159)) adds a **programmatic integration
surface** to a Patches node: a POST-only HTTP endpoint (`/mcp`) that serves the Model Context
Protocol so an MCP client (an agent/IDE/tool host) can call curated, read-only node tools.
This document records the architecture; `docs/research/model-context-protocol.md` records the
researched SDK facts behind it.

Current slice: **transport + application adapter**. The authorization _policy_ (which scopes
unlock which tools) is **#217 (decision-only)**, and tool/state **persistence + configuration**
is **#218 (blocked)** — neither is implemented here.

## 1. Why an out-of-band endpoint (and post-only)

The MCP surface is deliberately separate from the gRPC API that Patches clients use. It speaks
JSON-RPC over HTTP directly (not our Protobuf contract), so it is **not** another `patches.v1`
service in `packages/proto` — the transport and message shape are owned by the MCP SDK, and
`packages/proto` never imports server code (§129).

Following the `FederationHttpModule` pattern (ADR 0016 §4), the endpoint lives on Nest's
**always-on HTTP adapter** (`main.ts`), behind the operator opt-in `MCP_ENABLED` (default
**off**, spec §176 — a self-hosted node ships with this network surface off). When disabled the
module is **not registered at all** (absent from the DI graph, not merely unrouted) via the
conditional import in `app.module.ts`:

```ts
const mcpHttpEnabled = validateEnv(process.env).MCP_ENABLED;
// imports: ...(mcpHttpEnabled ? [McpHttpModule] : []),
```

The endpoint is **POST-only**. `createMcpHandler(factory, { legacy: 'reject' })` is the SDK's
modern-only posture: it rejects 2025-era GET/DELETE session traffic and names the unsupported
protocol versions. No sessionful legacy surface is served.

## 2. Layering and file map

```
apps/server/src/modules/mcp/
  mcp.http.module.ts    Nest module (controllers + providers) for the conditional import
  mcp.http.controller.ts  transport adapter — HTTP guards, bounded body, deadline; maps to SDK
  mcp.constants.ts       default transport budgets (1 MiB body, 15 s deadline)
  mcp-auth.service.ts    application seam — resolves per-request AuthInfo (#217 owner decision)
  mcp-tool.service.ts    application service — constructs the deterministic tool set (McpServer)
```

This mirrors the spec's layering (§128–129). The **controller is a transport adapter only**: it
never parses business domain and never lets a TypeORM entity cross the HTTP boundary. The
**tool service** sits at the application layer — it receives a verified `AuthInfo` (or
`undefined`) and registers a plain, deterministic tool set. It never touches a repository. The
only data a tool emits is an explicitly-mapped DTO (`ServerInfoDto`), never an entity.

## 3. Request pipeline (in order)

Every `/mcp` request passes through these stages in `mcp.http.controller.ts`:

1. **Origin guard (CSRF, spec §21).** `originValidation(config.mcpOrigins)` — a present `Origin`
   whose hostname is not allow-listed is rejected `403`. Requests with **no** `Origin` header
   pass (non-browser MCP clients don't send one).
2. **Host guard (DNS rebinding).** `hostHeaderValidation(config.mcpOrigins)` — `403` unless the
   `Host` hostname is allow-listed. Both guards are port-agnostic hostname checks that write
   their own JSON-RPC `403` and return `false`; the controller stops when either returns false.
3. **Auth seam.** `McpAuthService.resolveAuth(req)` → `AuthInfo | undefined` (undefined in v0).
   A real value is attached as `req.auth` so the SDK forwards it to `ctx.authInfo`, where
   `McpToolService` filters the tool set by `authInfo.scopes`. (Guard: `exactOptionalPropertyTypes`
   forbids assigning `undefined` to an optional property — only a real value is attached.)
4. **Bounded body.** Raw bytes are collected inline under `MCP_MAX_BODY_BYTES`; oversized is
   `413` before a byte reaches the handler (spec §21, §176 unbounded-input baseline). An
   oversized body is drained (`req.resume()`) rather than destroying the socket, so the client
   receives a clean `413` instead of a dropped connection.
5. **Request deadline.** The whole exchange (body read + MCP round-trip) is raced against
   `MCP_REQUEST_TIMEOUT_MS`; a stall is answered `504` (the SDK has no deadline of its own —
   spec §176 timeout baseline).
6. **SDK handler.** `toNodeHandler(mcpHandler)` forwards `req.auth` and routes the request
   through the SDK's transport; out-of-band SDK errors go to the structured logger, never
   altering the response.

## 4. Configuration (validated env)

Added to `packages/server/src/config/env.schema.ts` (all off-by-default):

| Var                      | Type / default       | Meaning                                                    |
| ------------------------ | -------------------- | ---------------------------------------------------------- |
| `MCP_ENABLED`            | bool / `false`       | serve `/mcp` at all; when false the module is unregistered |
| `MCP_ORIGINS`            | csv hostnames / `[]` | allow-list for the Origin + Host guards                    |
| `MCP_MAX_BODY_BYTES`     | int / `1048576`      | per-request body cap (bytes)                               |
| `MCP_REQUEST_TIMEOUT_MS` | int / `15000`        | per-request deadline (ms)                                  |

A `superRefine` requires `MCP_ORIGINS` **non-empty whenever `MCP_ENABLED=true`** — an operator
can't turn the endpoint on and skip its only browser-side CSRF defense. Getters live on
`AppConfigService` (`mcpEnabled`, `mcpOrigins`, `mcpMaxBodyBytes`, `mcpRequestTimeoutMs`).

## 5. Authorization seam (#217 owner decision)

`McpAuthService.resolveAuth` is the single seam where the #217 authorization model slots in.
The MCP SDK is strictly **pass-through** for auth: `createMcpHandler` never verifies a token
itself; it merely surfaces whatever `AuthInfo` this service resolves (`req.auth` →
`ctx.authInfo`).

**v0 default (implemented):** no token issuer exists yet, so `resolveAuth` returns `undefined`;
an unauthenticated request may call exactly the one public, read-only tool (`server.info`), the
same instance metadata every reachable client already reads from `SystemService.GetServerInfo`.
Nothing "claimed credential" can silently widen access before #217 defines verification: a
future unverifiable asserted token is rejected (thrown → mapped to an MCP error), never
downgraded to "call everything".

When #217 lands, the change is confined to this method (issuer/audience/scope vocabulary, the
RFC 8707 `resource` claim) plus a branch in `McpToolService.buildServer` on `authInfo.scopes` —
no transport edit.

## 6. Tool registry (deterministic)

`McpToolService` registers a **deterministic** tool set — fixed names + descriptions, one
`registerTool` per tool, no per-request invention from data. See `docs/research/model-context-protocol.md`
for the SDK `registerTool` signature. The current single tool:

- `server.info` — public, read-only instance metadata (`instanceName`, `protocol: 'mcp-2026'`),
  emitted as an explicitly-mapped DTO.

## 7. Security posture (issue #159)

Adversarial guarantees verified in `mcp.http.controller.test.ts` (real SDK transport + guards
mounted on a minimal `node:http` server, no DB):

- disallowed `Origin` → `403`; disallowed/forged `Host` → `403`; no `Origin` (non-browser) passes.
- body over budget → `413`; stalled request → `504`; non-POST → rejected (never served).
- a malformed modern body gets a structured JSON-RPC response, never a `500` stack.

Everything is bounded-input / bounded-time, follows the shared error model, and never lets a
entity escape toward the client. Content/alt text never passes through here in v0 (no tools
expose post bodies yet).

## 8. Status and seams

- **Implemented:** transport + module registration + env validation + `server.info` tool +
  adversarial transport tests.
- **Not implemented — #217 (decision-only):** OAuth audience/scope/tool-set/threat-model policy.
  Seam: `McpAuthService.resolveAuth` + a `buildServer` scope branch.
- **Not implemented — #218 (blocked):** tool/state persistence and operator configuration
  beyond env. Follow-up only.

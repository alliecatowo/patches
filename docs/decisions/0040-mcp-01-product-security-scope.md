# 0040. MCP-01 product and security scope

**Status:** Accepted
**Date:** 2026-09-01
**Related:** #217; [MCP transport research](../research/model-context-protocol.md)

## Context

PR #415 supplies an MCP Streamable HTTP transport and application seam. It does
not choose an issuer, resource audience, scope taxonomy, tool inventory, or
mutation policy. The verified research describes the 2026-07-28 transport and
OAuth requirements, including the security boundary that the host—not an MCP
tool—must verify bearer tokens before passing `authInfo` to the SDK.

Patches also has hard constraints that apply here: no plaintext or E2EE DM
content in logs, metrics, errors, or transport results; no TypeORM entities over
transport; no ranking or ordering of timelines; and no function gated behind a
cosmetic capability.

## Decision

### Product scope

1. MCP-01 is a reference-node, authenticated, read-only integration. The v0
   registered tool set contains exactly `server.info`. It exposes server
   capability/version information only; it does not expose posts, timelines,
   profiles, moderation evidence, credentials, or messages.
2. The tool list is deterministic for an authorization context and is built
   server-side. MCP annotations are descriptive hints only and never grant
   permission. Every future tool requires a separate scope mapping and review.
3. No mutation is in MCP-01. A future mutation must pass both server-side
   authorization and an explicit Patches approval record through the existing
   approval seam; host confirmation alone is insufficient. Its arguments are
   recorded only as a canonical SHA-256 digest, never as raw content.

### Resource and authorization

1. The resource identifier is the complete canonical endpoint URI:
   `https://<Patches-origin>/mcp`. The reference deployment value is
   `https://patches.social/mcp`; deployments must derive the origin from
   configuration and must not accept a request-supplied alias.
2. MCP uses a distinct access-token audience `patches:mcp`, separate from the
   web/API audience. The initial scope is `mcp:server:read`. Reserved future
   namespaces are `mcp:read:*` and `mcp:write:*`; they are not authorization
   grants until an ADR or amendment defines each one.
3. The host authentication boundary verifies issuer, signature/key, expiry,
   resource/audience, and scope before invoking the per-request MCP factory.
   An asserted but unverifiable bearer token is an authentication failure, not
   an anonymous request. Invalid, expired, wrong-resource, or insufficiently
   scoped tokens fail closed with HTTP 401/403 as appropriate. No tool parses a
   bearer token.
4. The resource server publishes RFC 9728 Protected Resource Metadata naming
   the configured authorization server. The authorization server must use the
   RFC 8707 resource value above in authorization and token requests. MCP-01
   does not implement CIMD or DCR because Patches is not an authorization
   server for arbitrary third-party clients.

### Transport and operations

1. Expose only modern Streamable HTTP POST at `/mcp` with protocol revision
   `2026-07-28`; reject legacy GET/DELETE/session behavior. Validate Origin
   before the MCP handler against an explicit Patches-controlled allowlist.
2. Apply bounded body size, request duration, SSE duration, and per-principal
   plus per-IP rate limits. Do not put tokens, tool arguments, account data, or
   DM/ciphertext content in logs, metrics, traces, error strings, or tool
   descriptions. Return sanitized model-visible output.
3. MCP-01 does not advertise `subscriptions/listen` or dynamic tool/resource
   change notifications. The SDK's process-local event bus is not a cross-
   replica coordination mechanism; enabling subscriptions requires a new
   bounded shared-state decision and replay/resource-retention analysis.
4. DPoP is deferred. It is not required by MCP and cannot be honestly enabled
   until Patches controls token key binding, proof validation, nonce/replay
   tracking, and multi-replica behavior.
5. MCP never crosses the federation seam and never exposes DMs, including
   E2EE ciphertext, keys, metadata intended to remain local, or approval data
   that would reveal DM content.

## Threat model and controls

| Threat                                        | Control                                                                                                         |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Token for another service or resource         | Distinct audience; exact RFC 8707 resource validation; issuer/signature/expiry checks at host boundary          |
| Forged or asserted-but-unverifiable token     | Fail closed before factory/tool construction; never downgrade to anonymous                                      |
| Origin/CSRF confused-deputy request           | HTTPS, explicit Origin allowlist, authentication, and bounded host policy                                       |
| Model-induced data exfiltration               | Minimal tool set; scope-filtered deterministic list; sanitized schemas/results; no secrets, credentials, or DMs |
| Client ignores annotations or confirmation UI | Server-side authorization; approval record required for any future mutation                                     |
| Request/SSE exhaustion or replay              | Body/time/rate bounds; no resumable SSE; DPoP remains deferred pending replay design                            |
| Cross-replica inconsistent subscriptions      | No subscriptions in v0; shared event/replay design is a prerequisite                                            |
| Sensitive values leaked through observability | Content-free logs/metrics/errors and digest-only approval correlation                                           |

## Consequences

MCP-01 is small enough to audit and cannot silently become a general account
automation API. Existing transport work can be completed without inventing
product policy. The tradeoff is that MCP clients initially learn only server
capabilities; each useful data or mutation tool needs a separately reviewed
scope, schema, privacy analysis, and (for mutations) approval path.

## Alternatives considered

- **Expose all existing read APIs:** rejected because it creates a broad
  model-visible data boundary before per-resource scope and privacy review.
- **Allow mutations with MCP client confirmation:** rejected because client
  annotations and UI are untrusted and cannot replace Patches authorization or
  approval records.
- **Reuse the web/API audience:** rejected because token confusion would make
  MCP a confused deputy and would couple independent client scopes.
- **Enable DPoP, CIMD/DCR, or subscriptions in v0:** deferred because each
  requires an owner-approved issuer, replay, SSRF, or cross-replica design that
  the verified research identifies as unresolved.

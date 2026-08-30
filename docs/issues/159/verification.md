# MCP-01 adversarial verification record

This record is limited to the committed implementation and tests available on
`origin/agent/wt-mcp-foundation-b220` at PR #415's reported head `26b2a06`.
It is not a rollout sign-off. No claim below is inferred from an unexecuted
client, a static code read, or a protocol specification alone.

## Exercised evidence

The real `node:http` transport test mounts `McpHttpController` and drives it
with raw requests. It verifies:

| Property | Evidence | Result |
| --- | --- | --- |
| Origin validation | disallowed `Origin` request | 403 |
| Host/DNS-rebinding guard | forged `Host` with allowed `Origin` | 403 |
| Non-browser request | no `Origin` header | not 403 |
| Request size | 4 KiB body against 1 KiB budget | 413 |
| Method posture | `GET /mcp` | 4xx, never 200 |
| Cancellation/deadline proxy | incomplete chunked body held past the configured deadline | 504 |
| Malformed input | `{}` body | structured JSON-RPC response, not 500 |

The cancellation result is transport deadline handling, not proof that an MCP
client cancellation notification interrupts application work. No such
application-cancellation test was exercised.

The test command exercised by the source branch was `mise run check server`
(11/11 tasks green, per PR #415). The source branch pins
`@modelcontextprotocol/server@2.0.0` and `@modelcontextprotocol/node@2.0.0`.

## Required categories not evidenced by this slice

These must remain explicit rollout blockers; they must not be described as
passing tests:

- Protocol-version mismatch: the tool response exposes the local
  `mcp-2026` marker, but no request with an unsupported MCP protocol version
  and expected rejection was exercised.
- OAuth audience/scope and approval bypass: token verification and policy are
  deferred to #217; v0 has no token issuer or approval record.
- SSRF: no OAuth metadata/client-registration fetcher exists in this slice.
- Replay: no bearer-token or DPoP validation/replay store exists.
- Subscription isolation: no subscription/listen surface or cross-principal
  event-bus test exists.
- Sensitive output: only `server.info` is registered; no redaction test exists.
- Audit provenance: no MCP audit event or provenance assertion exists.
- Client interoperability: evidence is raw HTTP transport only; no independent
  MCP client fixture (for example, an independently configured SDK client) is
  exercised, so there is no interoperability evidence.

## Evidence required before rollout

The following are concrete test obligations, intentionally recorded as open
rather than represented as passing tests:

| Category | Required adversarial proof |
| --- | --- |
| Protocol version | Unsupported and supported initialization versions have deterministic, spec-compatible outcomes. |
| Origin | Disallowed `Origin` and forged `Host` cannot reach the handler (covered by the exercised transport tests above). |
| OAuth audience/scope | Wrong audience and insufficient scope are rejected; valid scope cannot widen the registered tool set. |
| Approval bypass | A tool requiring approval cannot be invoked by omitting, replaying, or mutating the approval record. |
| SSRF | Metadata/client-registration inputs cannot reach loopback, link-local, private, or rebinding targets. |
| Replay | Reuse of a bearer/DPoP request or approval nonce is rejected deterministically. |
| Cancellation | Client cancellation stops or bounds application work, distinct from the HTTP deadline test above. |
| Subscription isolation | Events for principal A never reach principal B, including reconnect and identifier-confusion cases. |
| Sensitive output | Secrets, tokens, DM bodies, and internal URLs are absent from tool output and errors. |
| Audit provenance | Each tool action records actor, tool, resource, decision, and correlation provenance without bodies or secrets. |
| Interoperability | An independent MCP client completes initialization and the exercised `server.info` call against the deployed endpoint. |

Each future row needs the exact command, fixture/client version, environment,
observed status/result, and artifact link. Until then, these are rollout
blockers, not a checklist that can be checked by inspection.

## Rollout boundary

The verified slice supports a POST-only, opt-in, bounded transport and one
public read-only metadata tool. It does not establish authorization, approval,
SSRF, replay, subscription, sensitive-output, audit-provenance, protocol
version, or independent client-interoperability readiness. The endpoint must
remain off by default until those categories have executable evidence.

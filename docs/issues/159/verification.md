# MCP-01 adversarial verification record

This record is limited to the implementation and tests exercised for PR #415 and documented by PR #425. It is not rollout sign-off.

## Exercised evidence

The raw `node:http` transport test drives `McpHttpController` and verifies:

| Property | Observed result |
| --- | --- |
| Disallowed `Origin` | 403 |
| Forged `Host` with allowed `Origin` | 403 |
| Missing `Origin` | Not 403 |
| 4 KiB body against 1 KiB budget | 413 |
| `GET /mcp` | 4xx, never 200 |
| Incomplete chunked body past deadline | 504 |
| Malformed `{}` body | Structured JSON-RPC response, not 500 |

The deadline result is transport timeout handling, not proof that MCP client cancellation interrupts application work.

## Unverified rollout blockers

No executable evidence was recorded for protocol-version mismatch, OAuth audience/scope, approval bypass, SSRF, replay, subscription isolation, sensitive output, audit provenance, application-level cancellation, or independent-client interoperability. These must not be described as passing tests.

Required proof includes deterministic version negotiation/rejection; audience and scope enforcement; approval omission/replay/mutation rejection; private-target and rebinding SSRF protection; bearer/DPoP and approval-nonce replay rejection; bounded application cancellation; principal-isolated subscriptions; output/error redaction; body-free audit provenance; and an independently configured MCP client completing initialization and `server.info`.

## Rollout boundary

The exercised slice supports only a POST-only, opt-in, bounded transport and one public read-only metadata tool. Keep the endpoint off by default until the missing categories and independent-client interoperability have executable evidence.

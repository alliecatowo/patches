# Issue #177 plan

Implement a bounded MCP OAuth resource-server boundary on the HTTP edge: publish RFC 9728 metadata, define a distinct MCP resource/audience and narrow scopes, verify bearer tokens before dispatch, and prove rejection/challenge behavior for confused-deputy and token-forwarding cases. CIMD, DCR, and DPoP remain out of scope.

## Acceptance criteria

- RFC 9728 metadata is served for the canonical MCP resource and names an authorization server.
- MCP requests require a bearer token validated for issuer, EdDSA signature, expiry, MCP audience/resource, and narrow MCP scopes.
- Invalid/missing credentials return 401 with a correct `WWW-Authenticate` resource metadata challenge; insufficient scope returns 403 with `insufficient_scope`.
- Tokens for the existing API audience or another resource are rejected and never forwarded to dispatch.
- Focused tests cover metadata, valid dispatch, issuer/signature/expiry/audience/resource/scope failures, and token-forwarding/confused-deputy behavior.
- No CIMD, DCR, or DPoP implementation is introduced.

## Validation

- `mise run check apps/server`
- `git diff --check`

# Issue #217 handoff

Implemented the MCP-01 product/security decision as [ADR 0040](../../decisions/0040-mcp-01-product-security-scope.md).

The decision fixes `/mcp` to the canonical `https://<Patches-origin>/mcp`
resource identifier (reference origin `patches.social`), a distinct `patches:mcp`
audience, short-lived bearer access tokens with `mcp:server:read`, and a single
deterministic read-only `server.info` tool for v0. It requires host-side
verification of issuer, signature, expiry, resource/audience, and scopes before
building `authInfo`; asserted but unverifiable tokens fail closed.

The ADR also records Origin validation, limits, content-free telemetry, no
subscriptions on the process-local bus, and explicit deferral gates for
mutations, CIMD/DCR, DPoP, and all DM access.

Validation: targeted document/link/policy checks passed. The pinned Prettier
check could not run because mise rejected the untrusted workspace config and no
local Prettier binary was available. Full GitHub/project workpad update and pull
synchronization were externally blocked by unavailable connector approval,
invalid CLI auth/network, and read-only `.git` metadata. No commit, push, PR, or
CI polling was performed.

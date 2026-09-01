# MCP OAuth resource-server boundary

Patches treats `/mcp` as a distinct OAuth resource, not as another client of the browser/API session. Its audience is `patches-mcp`, and its only supported scopes are `mcp:read` and `mcp:write`. A token must carry the canonical resource URI (`PUBLIC_ORIGIN` plus `/mcp`) and must pass issuer, EdDSA signature, expiry, audience, and scope checks before an MCP handler receives claims.

Protected Resource Metadata is published at `/.well-known/oauth-protected-resource/mcp` (RFC 9728's path-qualified form). The authorization server is configured with `MCP_AUTHORIZATION_SERVER`; metadata is intentionally unavailable until an actual authorization server is configured rather than advertising the ordinary Patches origin as one.

The resource-server helper returns verified claims without the bearer token. API-audience tokens, tokens for another resource, malformed credentials, and verifier failures therefore cannot be forwarded to MCP dispatch. CIMD, dynamic client registration, and DPoP are not implemented.

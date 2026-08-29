import type { IncomingMessage } from 'node:http';

import { Injectable } from '@nestjs/common';

import type { AuthInfo } from '@modelcontextprotocol/server';

/**
 * Constructs the {@link AuthInfo} that governs which tools a given `/mcp` request may call.
 *
 * This is the owner-decision seam for MCP-01's authorization model (issue #217: "Decide
 * MCP-01 product/security scope" — audience, scopes, tool set, threat model). The MCP SDK
 * is strictly pass-through here: `createMcpHandler` never verifies a token itself, it merely
 * surfaces whatever `AuthInfo` this service resolves (via `req.auth` → `ctx.authInfo`, see
 * `McpHttpController`). So everything we want to *decide* later slots into this one method
 * without touching the transport:
 *
 *  - which access-token format / issuer is accepted (JWT vs opaque, the #217 bearer/OAuth
 *    decision from `docs/research/model-context-protocol.md`);
 *  - the RFC 8707 `resource` identifier this node's `/mcp` server claims;
 *  - which scopes open which tools (`McpToolService` already keys the tool set off
 *    `AuthInfo.scopes`).
 *
 * **v0 default: no issued token exists** — nothing signs MCP-issued access tokens yet, so no
 * request carries a verifiable credential and `resolveAuth` returns `undefined`. An
 * unauthenticated request may call exactly the one public, read-only tool
 * (`server.info`), the same info every reachable client already gets from
 * `SystemService.GetServerInfo`. A request that *claims* to carry a token whose verification
 * #217 has not defined must not silently degrade into "call everything" — instead the
 * verification method throws, which `McpHttpController` maps to an MCP-level error, so an
 * asserted credential can never widen access before the policy exists.
 */
@Injectable()
export class McpAuthService {
  /**
   * Resolve a verified `AuthInfo` for an inbound `/mcp` request, or `undefined` for an
   * unauthenticated one. See the class doc for the #217 decision seam.
   *
   * @param _request The inbound HTTP request (unused in v0 — no issuer verifies tokens yet).
   * @throws MCP-01 future: once #217 picks an issuer, an unverifiable asserted credential is
   *   rejected here rather than falling back to the unauthenticated tool set.
   */
  resolveAuth(_request: IncomingMessage): Promise<AuthInfo | undefined> {
    return Promise.resolve(undefined);
  }
}

import { Module } from '@nestjs/common';

import { McpAuthService } from './mcp-auth.service.js';
import { McpHttpController } from './mcp.http.controller.js';
import { McpToolService } from './mcp-tool.service.js';

/**
 * The MCP-01 `/mcp` HTTP surface (issue #220) — split out as its own module specifically so it
 * can be **absent from the DI graph** on a node with `MCP_ENABLED=false` (`app.module.ts`,
 * ADR 0016 §4's "absent, not merely unrouted"). This mirrors `FederationHttpModule`'s shape: an
 * always-registered *service* module would be pulled in transitively by other modules, but this
 * HTTP-only module has no transitive importer, so `app.module.ts` can genuinely leave it out.
 *
 * Providers here are the transport-authorization seam (`McpAuthService`) and the
 * application-service tool factory (`McpToolService`); `AppConfigService` comes from the
 * always-on `AppConfigModule`. No TypeORM entity is reachable through this module — see
 * `docs/architecture/mcp.md`.
 */
// nestjs-doctor-ignore-next-line performance/no-orphan-modules -- conditionally imported in app.module.ts's `imports` spread (`...(mcpEnabled ? [McpHttpModule] : [])`, ADR 0016 §4), invisible to static module-graph analysis
@Module({
  controllers: [McpHttpController],
  providers: [McpAuthService, McpToolService],
})
export class McpHttpModule {}

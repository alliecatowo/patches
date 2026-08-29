import type { AuthInfo, McpServer } from '@modelcontextprotocol/server';

import { AppConfigService } from '../../config/app-config.service.js';

export interface ServerInfoDto {
  /** Human-readable instance name (mirrors `INSTANCE_NAME`). */
  instanceName: string;
  /** This node's protocol-era marker so an MCP client can tell it's the modern endpoint. */
  protocol: 'mcp-2026';
}

/**
 * Application service that constructs the per-request `McpServer` (the tool surface) for
 * `/mcp` (MCP-01, issue #220).
 *
 * Boundaries (spec §128–129): this service sits at the application layer — it receives a
 * verified {@link AuthInfo} (or `undefined`) and registers a plain, **deterministic** tool
 * set. It never touches a repository and never lets a TypeORM entity escape toward the
 * client: the only data a tool emits is an explicitly-mapped DTO ({@link ServerInfoDto}).
 * "Deterministic schemas" (issue #220) means every tool is registered once here with a fixed
 * name + description — no tool is invented per request from data.
 *
 * The tool **set** — which scopes unlock which tools — is the #217 owner decision (see
 * `mcp-auth.service.ts`). This service implements the *mechanism* only: `buildServer` receives
 * the per-request `authInfo` and could vary the registered tools by `authInfo.scopes`. Until
 * #217 settles the OAuth audience/scope vocabulary, no issued token exists, every request is
 * unauthenticated, and the only registered tool is the public, read-only `server.info` — the
 * same instance metadata every reachable client already gets from `SystemService.GetServerInfo`.
 * When scoped tools land, adding a branch on `authInfo?.scopes` here is the only change.
 */
export class McpToolService {
  constructor(private readonly config: AppConfigService) {}

  /**
   * Register the deterministic tool set onto a fresh `McpServer` for one serving unit.
   *
   * @param _authInfo The per-request authorization (unused in v0 — see the class doc). Kept as
   *   a parameter so the #217-scoped set drops in without a signature change.
   */
  buildServer(_authInfo: AuthInfo | undefined, server: McpServer): void {
    this.registerServerInfo(server);
  }

  private registerServerInfo(server: McpServer): void {
    void server.registerTool(
      'server.info',
      {
        description:
          'Public, read-only metadata about this Patches node (the same data every reachable ' +
          'client reads from SystemService.GetServerInfo). No credential required.',
      },
      async (): Promise<{ content: { type: 'text'; text: string }[] }> => {
        const dto: ServerInfoDto = {
          instanceName: this.config.instanceName,
          protocol: 'mcp-2026' as const,
        };
        return { content: [{ type: 'text', text: JSON.stringify(dto) }] };
      },
    );
  }
}

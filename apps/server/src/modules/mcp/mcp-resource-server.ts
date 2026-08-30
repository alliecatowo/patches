import { Inject, Injectable } from '@nestjs/common';

import { AppError } from '../../common/errors/app-error.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { type McpAccessTokenClaims } from '../auth/token.service.js';
import { TokenService } from '../auth/token.service.js';

export const MCP_RESOURCE_PATH = '/mcp';
export const MCP_READ_SCOPE = 'mcp:read';
export const MCP_WRITE_SCOPE = 'mcp:write';

export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: readonly [string];
  scopes_supported: readonly [string, string];
}

export interface McpTokenVerifier {
  verifyMcpAccessToken(token: string, resource: string): Promise<McpAccessTokenClaims>;
}

export interface McpResourceConfig {
  publicOrigin: string;
  mcpAuthorizationServer: string | undefined;
}

/** The authentication boundary for MCP HTTP dispatch. Callers pass only the returned claims
 * into a handler; the original bearer token is intentionally not part of the result. */
@Injectable()
export class McpResourceServer {
  constructor(
    @Inject(TokenService)
    private readonly tokens: McpTokenVerifier,
    @Inject(AppConfigService)
    private readonly config: McpResourceConfig,
  ) {}

  resourceUri(): string {
    return new URL(MCP_RESOURCE_PATH, ensureOrigin(this.config.publicOrigin)).toString();
  }

  metadata(): ProtectedResourceMetadata {
    const authorizationServer = this.config.mcpAuthorizationServer;
    if (authorizationServer === undefined) {
      throw new Error(
        'MCP_AUTHORIZATION_SERVER must be configured before publishing MCP metadata.',
      );
    }
    return {
      resource: this.resourceUri(),
      authorization_servers: [authorizationServer],
      scopes_supported: [MCP_READ_SCOPE, MCP_WRITE_SCOPE],
    };
  }

  async authenticate(
    authorizationHeader: string | undefined,
    requiredScopes: readonly string[] = [MCP_READ_SCOPE],
  ): Promise<McpAccessTokenClaims> {
    const token = bearerToken(authorizationHeader);
    if (token === undefined) throw unauthorized(this.challenge());
    let claims: McpAccessTokenClaims;
    try {
      claims = await this.tokens.verifyMcpAccessToken(token, this.resourceUri());
    } catch (error) {
      if (error instanceof AppError) throw unauthorized(this.challenge());
      throw error;
    }
    if (requiredScopes.some((scope) => !claims.scope.has(scope))) {
      throw new AppError('AUTH_INVALID_CREDENTIALS', 'MCP access token lacks the required scope.', {
        context: {
          httpStatus: 403,
          wwwAuthenticate: `Bearer error="insufficient_scope", scope="${requiredScopes.join(' ')}"`,
        },
      });
    }
    return claims;
  }

  challenge(): string {
    return `Bearer resource_metadata="${new URL(
      '/.well-known/oauth-protected-resource/mcp',
      ensureOrigin(this.config.publicOrigin),
    ).toString()}"`;
  }
}

function ensureOrigin(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function bearerToken(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const match = /^Bearer\s+([^\s]+)$/i.exec(value.trim());
  return match?.[1];
}

function unauthorized(challenge: string): AppError {
  return new AppError('AUTH_INVALID_CREDENTIALS', 'MCP authentication required.', {
    context: { httpStatus: 401, wwwAuthenticate: challenge },
  });
}

import { describe, expect, it, vi } from 'vitest';

import { AppError } from '../../common/errors/app-error.js';
import {
  MCP_READ_SCOPE,
  MCP_WRITE_SCOPE,
  McpResourceServer,
  type McpResourceConfig,
  type McpTokenVerifier,
} from './mcp-resource-server.js';

const config: McpResourceConfig = {
  publicOrigin: 'https://patches.example',
  mcpAuthorizationServer: 'https://auth.example/authorize',
};

const claims = {
  userId: 'user-1',
  actorId: 'actor-1',
  sessionId: 'session-1',
  expiresAt: new Date(Date.now() + 60_000),
  resource: 'https://patches.example/mcp',
  scope: new Set([MCP_READ_SCOPE, MCP_WRITE_SCOPE]),
};

describe('McpResourceServer', () => {
  it('publishes RFC 9728 metadata for the path-qualified resource', () => {
    const server = new McpResourceServer(verifier(), config);

    expect(server.metadata()).toEqual({
      resource: 'https://patches.example/mcp',
      authorization_servers: ['https://auth.example/authorize'],
      scopes_supported: [MCP_READ_SCOPE, MCP_WRITE_SCOPE],
    });
    expect(server.challenge()).toBe(
      'Bearer resource_metadata="https://patches.example/.well-known/oauth-protected-resource/mcp"',
    );
  });

  it('passes verified claims to the caller and never returns the bearer token', async () => {
    const verify = vi.fn(async () => claims);
    const server = new McpResourceServer({ verifyMcpAccessToken: verify }, config);

    await expect(server.authenticate('Bearer opaque-token')).resolves.toEqual(claims);
    expect(verify).toHaveBeenCalledWith('opaque-token', 'https://patches.example/mcp');
  });

  it.each([undefined, 'Basic abc', 'Bearer'])(
    'rejects malformed authorization %s',
    async (header) => {
      const server = new McpResourceServer(verifier(), config);

      await expect(server.authenticate(header)).rejects.toMatchObject({
        code: 'AUTH_INVALID_CREDENTIALS',
        context: { httpStatus: 401 },
      });
    },
  );

  it('rejects a token that lacks the requested narrow scope', async () => {
    const server = new McpResourceServer(
      verifier({ ...claims, scope: new Set([MCP_READ_SCOPE]) }),
      config,
    );

    await expect(server.authenticate('Bearer token', [MCP_WRITE_SCOPE])).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
      context: {
        httpStatus: 403,
        wwwAuthenticate: 'Bearer error="insufficient_scope", scope="mcp:write"',
      },
    });
  });

  it('does not turn verifier failures into dispatchable claims', async () => {
    const server = new McpResourceServer(
      verifierFailure(new AppError('AUTH_INVALID_CREDENTIALS', 'wrong audience')),
      config,
    );

    await expect(server.authenticate('Bearer api-token')).rejects.toMatchObject({
      context: { httpStatus: 401 },
    });
  });
});

function verifier(value = claims): McpTokenVerifier {
  return { verifyMcpAccessToken: vi.fn(async () => value) };
}

function verifierFailure(error: AppError): McpTokenVerifier {
  return {
    verifyMcpAccessToken: vi.fn(async () => {
      throw error;
    }),
  };
}

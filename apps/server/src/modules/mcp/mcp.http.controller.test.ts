import { createServer, request as httpRequest, type IncomingMessage, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';

import { afterAll, describe, expect, it } from 'vitest';

import { AppConfigService } from '../../config/app-config.service.js';
import { McpAuthService } from './mcp-auth.service.js';
import { McpHttpController } from './mcp.http.controller.js';
import { McpToolService } from './mcp-tool.service.js';

/**
 * Adversarial transport tests for the `/mcp` endpoint (MCP-01, issue #220). They mount the real
 * `McpHttpController` (with the real SDK transport + guards) on a minimal `node:http` server and
 * drive it with real requests — no Nest app, no DB — so the Origin/Host guards, the bounded body
 * and the request deadline are exercised exactly as they run in production, including their
 * side effects on `req`/`res`.
 *
 * The allow-list below includes both `127.0.0.1` (the host we bind) and `localhost` so the Host
 * guard passes for the happy-path and no-Origin requests.
 */
const DEFAULT_ORIGINS = ['127.0.0.1', 'localhost'];

interface Overrides {
  origins?: readonly string[];
  maxBodyBytes?: number;
  timeoutMs?: number;
}

async function withServer(
  overrides: Overrides,
  fn: (baseUrl: string, port: number) => Promise<void> | void,
): Promise<void> {
  const config = {
    instanceName: 'patches-test',
    mcpOrigins: overrides.origins ?? DEFAULT_ORIGINS,
    mcpMaxBodyBytes: overrides.maxBodyBytes ?? 1024,
    mcpRequestTimeoutMs: overrides.timeoutMs ?? 5000,
  } as unknown as AppConfigService;

  const controller = new McpHttpController(
    config,
    new McpToolService(config),
    new McpAuthService(),
  );
  const server: Server = createServer((req, res) => {
    void controller.handle(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  try {
    await fn(`http://127.0.0.1:${port}`, port);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/** Issue a raw request so we control the `Host`/`Origin`/method/body precisely. */
function rawPost(
  port: number,
  path: string,
  opts: { host?: string; origin?: string; body?: string; method?: string } = {},
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (opts.host !== undefined) headers.host = opts.host;
    if (opts.origin !== undefined) headers.origin = opts.origin;
    headers['content-type'] = 'application/json';

    const req = httpRequest(
      { host: '127.0.0.1', port, path, method: opts.method ?? 'POST', headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }),
        );
      },
    );
    req.on('error', reject);
    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });
}

describe('McpHttpController /mcp transport guards (MCP-01, issue #220)', () => {
  it('rejects a request whose Origin hostname is not allow-listed (403, CSRF)', async () => {
    await withServer({}, async (_base, port) => {
      const res = await rawPost(port, '/mcp', {
        origin: 'https://evil.example',
        body: '{}',
      });
      expect(res.status).toBe(403);
    });
  });

  it('rejects a request with a forged Host header (403, DNS-rebinding), even with a valid Origin', async () => {
    await withServer({}, async (_base, port) => {
      const res = await rawPost(port, '/mcp', {
        host: 'evil.example',
        origin: 'https://127.0.0.1',
        body: '{}',
      });
      expect(res.status).toBe(403);
    });
  });

  it('accepts a request with no Origin header (non-browser MCP client passes the guard)', async () => {
    await withServer({}, async (base) => {
      const res = await rawPost(Number(new URL(base).port), '/mcp', { body: '{}' });
      expect(res.status).not.toBe(403);
    });
  });

  it('rejects a body over the byte budget (413)', async () => {
    await withServer({ maxBodyBytes: 1024 }, async (_base, port) => {
      const res = await rawPost(port, '/mcp', { body: 'x'.repeat(4096) });
      expect(res.status).toBe(413);
    });
  });

  it('rejects non-POST methods on /mcp (never served a response that grants tools)', async () => {
    await withServer({}, async (_base, port) => {
      const res = await rawPost(port, '/mcp', { method: 'GET' });
      // The SDK's `legacy: 'reject'` answers a bare GET with a client error (400, missing
      // protocol headers) rather than a success; the guarantee we assert is "not served", not
      // one specific SDK-internal status code. Nest's real `@Post()` routing rejects the method
      // before the controller body runs in production.
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(res.status).not.toBe(200);
    });
  });

  it('answers a stalled request body with 504 (request deadline)', async () => {
    await withServer({ timeoutMs: 75 }, async (_base, port) => {
      const res = await new Promise<{ status: number; text: string }>((resolve, reject) => {
        const req = httpRequest(
          {
            host: '127.0.0.1',
            port,
            path: '/mcp',
            method: 'POST',
            headers: { 'content-type': 'application/json', 'transfer-encoding': 'chunked' },
          },
          (r) => {
            const chunks: Buffer[] = [];
            r.on('data', (c) => chunks.push(c));
            r.on('end', () =>
              resolve({ status: r.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }),
            );
          },
        );
        req.on('error', reject);
        // Send a partial chunk and never finish -> the server's deadline must fire.
        req.write('{"jsonrpc":"2.0"');
      });
      expect(res.status).toBe(504);
    });
  });

  it('serves a structured JSON-RPC response for a malformed modern body, not a 500', async () => {
    await withServer({}, async (_base, port) => {
      const res = await rawPost(port, '/mcp', { body: '{}' });
      expect(res.status).toBeLessThan(500);
      expect(() => JSON.parse(res.text)).not.toThrow();
    });
  });
});

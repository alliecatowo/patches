import type { IncomingMessage, ServerResponse } from 'node:http';

import { Controller, Logger, Post, Req, Res } from '@nestjs/common';
import { createMcpHandler, McpServer, type AuthInfo } from '@modelcontextprotocol/server';
import {
  hostHeaderValidation,
  originValidation,
  toNodeHandler,
  type NodeIncomingMessageLike,
  type NodeMcpRequestHandler,
} from '@modelcontextprotocol/node';

import { AppConfigService } from '../../config/app-config.service.js';
import { McpAuthService } from './mcp-auth.service.js';
import { McpToolService } from './mcp-tool.service.js';

/** Version advertised by this node's MCP endpoint (the SDK negotiates the protocol revision
 * itself). Bumped only when the tool surface materially changes. */
const MCP_SERVER_VERSION = '0.1.0';

/**
 * Transport error codes for the JSON-RPC responses this controller writes directly (before the
 * SDK transports get the body, or when it never does — e.g. body-budget/timeout/guard fails).
 */
const JSONRPC_PARSE_ERROR = -32700;

interface CollectedBody {
  /** The exact raw bytes, returned only when within the budget and fully read. */
  bytes: Buffer;
  /** JSON value parsed from {@link bytes} bound by the MCP SDK by construction. */
  parsed: unknown;
}

/**
 * The single POST-only `/mcp` endpoint (MCP-01, issue #220), bound on Nest's always-on HTTP
 * adapter (ADR 0016 §4) and served through the MCP SDK's Node adapter. It mirrors the
 * `FederationHttpModule` shape (off-by-default conditional module — `apps/server/app.module.ts`).
 *
 * This controller is a **transport adapter only** (spec §128): it parses none of the business
 * domain and never lets a TypeORM entity cross the HTTP boundary (that boundary lives in
 * `McpToolService`, `docs/architecture/mcp.md`). Its specific responsibilities:
 *
 *  - **POST-only modern.** Uses `createMcpHandler(factory, { legacy: 'reject' })` — the SDK's
 *    strict modern-only posture, which rejects 2025-era GET/DELETE session traffic with
 *    `405 Method not allowed` and names the unsupported protocol versions. No sessionful legacy
 *    surface is served.
 *  - **Origin guard (CSRF) and Host guard (DNS rebinding).** Every request passes through
 *    `originValidation(origins)` and `hostHeaderValidation(origins)` before the body is read; a
 *    disallowed present `Origin`, or a `Host` not on the allow-list, is answered `403` by the
 *    guard without ever reaching the MCP handler.
 *  - **Bounded body.** The raw body is collected inline under `mcpMaxBodyBytes`; oversized is
 *    rejected `413` before a byte reaches the handler (spec §21, §176 unbounded-input baseline).
 *  - **Request deadline.** The whole exchange (body read + MCP round-trip) is raced against
 *    `mcpRequestTimeoutMs`; a stall answers `504`. (The SDK has no deadline of its own — spec
 *    §176 timeout baseline.)
 *  - **Auth seam.** `McpAuthService.resolveAuth` produces the per-request {@link AuthInfo}
 *    (undefined in v0 — no token issuer exists; see `mcp-auth.service.ts`), attached as
 *    `req.auth` so the SDK forwards it to `ctx.authInfo`, where `McpToolService` filters the
 *    tool set. The SDK is strictly pass-through for this — it never verifies a token itself.
 */
@Controller('mcp')
export class McpHttpController {
  private readonly handler: NodeMcpRequestHandler;
  private readonly logger = new Logger(McpHttpController.name);
  private readonly reportSdkError = (error: Error): void => this.reportError(error);

  constructor(
    private readonly config: AppConfigService,
    private readonly tools: McpToolService,
    private readonly auth: McpAuthService,
  ) {
    const mcpHandler = createMcpHandler(
      (ctx) => {
        const server = new McpServer({
          name: this.config.instanceName,
          version: MCP_SERVER_VERSION,
        });
        this.tools.buildServer(ctx.authInfo, server);
        return server;
      },
      { legacy: 'reject' },
    );
    this.handler = toNodeHandler(mcpHandler, { onerror: this.reportSdkError });
  }

  @Post()
  async handle(@Req() req: IncomingMessage, @Res() res: ServerResponse): Promise<void> {
    try {
      await this.serve(req, res);
    } catch (error) {
      if (error instanceof Error) this.reportError(error);
      else if (typeof error === 'string') this.reportError(new Error(error));
      if (!res.writableEnded) {
        this.respondError(res, 500, JSONRPC_PARSE_ERROR, 'Internal error');
      }
    }
  }

  private async serve(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Origin (CSRF) and Host (DNS rebinding) guards run before any body read. A returning
    // `false` guard has already written its own 403 — stop here.
    if (!originValidation([...this.config.mcpOrigins])(req, res)) return;
    if (!hostHeaderValidation([...this.config.mcpOrigins])(req, res)) return;

    const deadline = this.config.mcpRequestTimeoutMs;
    const authInfo = await this.auth.resolveAuth(req);
    // The SDK's toNodeHandler forwards `req.auth` as the pass-through authInfo; only attach a
    // real value — `exactOptionalPropertyTypes` forbids assigning `undefined` to an optional
    // property, and an absent `req.auth` is exactly "unauthenticated" to the adapter.
    if (authInfo !== undefined) {
      (req as IncomingMessage & { auth: AuthInfo }).auth = authInfo;
    }

    const collected = await this.collectBoundedBody(req, res, deadline);
    if (collected === undefined) return; // a body-budget/timeout error was already written

    await this.withTimeout(
      this.handler(req as unknown as NodeIncomingMessageLike, res, collected.parsed),
      res,
      deadline,
    );
  }

  /**
   * Collect the request body bounded by `mcpMaxBodyBytes`, racing the read against the request
   * deadline. Writes `413` (oversized) or `504` (timeout/read error) itself and returns
   * `undefined`; otherwise returns the raw bytes plus their JSON parse.
   */
  private async collectBoundedBody(
    req: IncomingMessage,
    res: ServerResponse,
    deadlineMs: number,
  ): Promise<CollectedBody | undefined> {
    const budget = this.config.mcpMaxBodyBytes;

    return await new Promise<CollectedBody | undefined>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let received = 0;
      let settled = false;

      const finish = (result: CollectedBody | undefined, err?: Error): void => {
        if (settled) return;
        settled = true;
        req.removeListener('data', onData);
        req.removeListener('end', onEnd);
        req.removeListener('error', onError);
        clearTimeout(timer);
        if (err) reject(err);
        else resolve(result);
      };

      const onData = (chunk: Buffer): void => {
        received += chunk.length;
        if (!settled && received > budget) {
          this.respondError(res, 413, JSONRPC_PARSE_ERROR, 'Payload too large');
          this.reportError(new Error(`/mcp body exceeded ${budget} bytes`));
          req.resume();
          finish(undefined);
          return;
        }
        if (!settled) chunks.push(chunk);
      };
      const onEnd = (): void => {
        if (settled) return;
        const bytes = Buffer.concat(chunks);
        let parsed: unknown;
        try {
          parsed = JSON.parse(bytes.toString('utf8'));
        } catch {
          this.respondError(res, 400, JSONRPC_PARSE_ERROR, 'Parse error');
          finish(undefined);
          return;
        }
        finish({ bytes, parsed });
      };
      const onError = (err: Error): void => finish(undefined, err);

      req.on('data', onData);
      req.on('end', onEnd);
      req.on('error', onError);

      const timer = setTimeout(() => {
        this.respondError(res, 504, JSONRPC_PARSE_ERROR, 'Request timed out');
        this.reportError(new Error(`/mcp body read exceeded ${deadlineMs}ms`));
        req.destroy();
        finish(undefined);
      }, deadlineMs);
    });
  }

  /** Race an already-started MCP exchange against the request deadline. If the exchange wins,
   * nothing extra is written (the adapter already wrote the response). If the deadline wins
   * first and the adapter hasn't started writing yet, answer 504 — the still-running promise is
   * left for the adapter's own cleanup, never abandoned mid-write. */
  private async withTimeout(
    run: Promise<void>,
    res: ServerResponse,
    deadlineMs: number,
  ): Promise<void> {
    let finished = false;
    const raced = await Promise.race([
      run.then(() => {
        finished = true;
      }),
      new Promise<void>((resolve) => setTimeout(resolve, deadlineMs)),
    ]);
    void raced;
    if (!finished && !res.headersSent && !res.writableEnded) {
      this.respondError(res, 504, JSONRPC_PARSE_ERROR, 'Request timed out');
      this.reportError(new Error(`/mcp exchange exceeded ${deadlineMs}ms`));
    }
  }

  /** Write a JSON-RPC error response, honoring whether the response already started. */
  private respondError(res: ServerResponse, status: number, code: number, message: string): void {
    if (res.writableEnded) return;
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code, message },
      }),
    );
  }

  /** Route the SDK's out-of-band error reporting (and our own) through the structured logger;
   * it never alters the response (SDK contract). */
  private reportError(error: Error): void {
    this.logger.error(error.message);
  }
}

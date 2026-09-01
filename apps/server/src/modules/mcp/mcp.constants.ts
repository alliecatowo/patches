/**
 * Shared literals for the `/mcp` endpoint (MCP-01, issue #220).
 *
 * Transport-level budgets default here and are overridable per node via the
 * corresponding env vars (`MCP_MAX_BODY_BYTES`, `MCP_REQUEST_TIMEOUT_MS`,
 * `env.schema.ts`) — unlike the SDK's own defaults, these are enforced by this
 * node's HttpBudgetInterceptor-shaped middleware before a byte of body is handed
 * to the MCP handler, and independently of whatever budget an upgrade changes.
 */

/** Default cap on a single `/mcp` request body, bytes. Matches federation's
 * `MAX_INBOUND_BODY_BYTES` (1 MiB) — the same "bounded input" baseline (spec §21, §176). */
export const MCP_DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

/** Default deadline for a single `/mcp` request (body read plus MCP exchange), ms. */
export const MCP_DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

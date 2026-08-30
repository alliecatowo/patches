import { createHash } from 'node:crypto';

export const MCP_DECISIONS = ['APPROVED', 'DENIED'] as const;
export type McpDecision = (typeof MCP_DECISIONS)[number];

export const MCP_RISK_TIERS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type McpRiskTier = (typeof MCP_RISK_TIERS)[number];

export interface McpToolRequest {
  requestId: string;
  clientName: string;
  principalId: string;
  scopes: readonly string[];
  toolName: string;
  args: Record<string, unknown>;
  isMutation: boolean;
  /** Informational only. Never use annotations to decide authorization. */
  toolAnnotations?: Record<string, unknown>;
}

export interface McpApprovalRecord {
  requestId: string;
  recordedAt: string;
  clientName: string;
  principalId: string;
  scopes: readonly string[];
  toolName: string;
  argsDigestSha256: string;
  decision: McpDecision;
  approverPrincipal: string;
  riskTier: McpRiskTier;
}

export interface McpApprovalDecision {
  approved: boolean;
  approverPrincipal: string;
}

export type McpApprovalPrompt = (request: McpToolRequest, riskTier: McpRiskTier) => Promise<McpApprovalDecision>;
export type McpApprovalRecorder = (record: McpApprovalRecord) => Promise<void>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

/** Hashes arguments for audit correlation without retaining their contents. */
export function computeMcpArgsDigest(args: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(args))).digest('hex');
}

/** Risk is derived from the operation, never from untrusted tool annotations. */
export function evaluateMcpRisk(request: Pick<McpToolRequest, 'toolName' | 'isMutation'>): McpRiskTier {
  if (!request.isMutation) return 'LOW';
  const criticalNames = ['delete', 'drop', 'execute', 'revoke', 'write'];
  if (criticalNames.some((name) => request.toolName.toLowerCase().includes(name))) return 'CRITICAL';
  return 'HIGH';
}

export class McpApprovalGate {
  public constructor(
    private readonly record: McpApprovalRecorder,
    private readonly prompt: McpApprovalPrompt,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  public async authorize(request: McpToolRequest): Promise<{ proceed: boolean; record: McpApprovalRecord }> {
    const riskTier = evaluateMcpRisk(request);
    const decision = await this.prompt(request, riskTier);
    const record: McpApprovalRecord = {
      requestId: request.requestId,
      recordedAt: this.now(),
      clientName: request.clientName,
      principalId: request.principalId,
      scopes: [...request.scopes],
      toolName: request.toolName,
      argsDigestSha256: computeMcpArgsDigest(request.args),
      decision: decision.approved ? 'APPROVED' : 'DENIED',
      approverPrincipal: decision.approverPrincipal,
      riskTier,
    };
    await this.record(record);
    return { proceed: decision.approved, record };
  }
}

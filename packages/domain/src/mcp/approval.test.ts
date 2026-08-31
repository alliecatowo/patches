import { describe, expect, it, vi } from 'vitest';

import { McpApprovalGate, computeMcpArgsDigest, evaluateMcpRisk } from './approval.js';

const request = {
  requestId: 'req-1',
  clientName: 'Patchwork Desktop',
  principalId: 'actor-1',
  scopes: ['posts:write'],
  toolName: 'write_post',
  args: { body: 'a secret post', nested: { z: 2, a: 1 } },
  isMutation: true,
  toolAnnotations: { readOnlyHint: true },
};

describe('MCP approval gate', () => {
  it('requires an explicit decision even when annotations claim read-only', async () => {
    const record = vi.fn().mockResolvedValue(undefined);
    const prompt = vi.fn().mockResolvedValue({ approved: false, approverPrincipal: 'actor-1' });
    const result = await new McpApprovalGate(
      record,
      prompt,
      () => '2026-08-30T00:00:00.000Z',
    ).authorize(request);

    expect(prompt).toHaveBeenCalledWith(request, 'CRITICAL');
    expect(result.proceed).toBe(false);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'DENIED', riskTier: 'CRITICAL' }),
    );
  });

  it('records approvals without persisting argument contents', async () => {
    const records: unknown[] = [];
    const result = await new McpApprovalGate(
      (value) => {
        records.push(value);
        return Promise.resolve();
      },
      () => Promise.resolve({ approved: true, approverPrincipal: 'actor-1' }),
      () => '2026-08-30T00:00:00.000Z',
    ).authorize(request);

    expect(result.proceed).toBe(true);
    expect(JSON.stringify(records)).not.toContain('a secret post');
    expect(result.record.argsDigestSha256).toBe(computeMcpArgsDigest(request.args));
  });

  it('canonicalizes nested object key order', () => {
    expect(computeMcpArgsDigest({ b: 2, a: { d: 4, c: 3 } })).toBe(
      computeMcpArgsDigest({ a: { c: 3, d: 4 }, b: 2 }),
    );
  });

  it('classifies reads as low risk and mutations conservatively', () => {
    expect(evaluateMcpRisk({ toolName: 'get_profile', isMutation: false })).toBe('LOW');
    expect(evaluateMcpRisk({ toolName: 'publish_post', isMutation: true })).toBe('HIGH');
  });
});

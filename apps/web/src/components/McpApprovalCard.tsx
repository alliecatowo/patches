import type { McpRiskTier, McpToolRequest } from '@patches/domain';
import type { JSX } from 'react';

import styles from './McpApprovalCard.module.css';

export interface McpApprovalCardProps {
  request: McpToolRequest;
  riskTier: McpRiskTier;
  onDecision: (approved: boolean) => void;
  disabled?: boolean;
}

/**
 * The decision surface is deliberately presentation-only: the caller must invoke the domain
 * gate and record the resulting decision before executing a tool. Tool annotations are shown as
 * untrusted hints and the card never treats a host confirmation as authorization.
 */
export function McpApprovalCard({
  request,
  riskTier,
  onDecision,
  disabled = false,
}: McpApprovalCardProps): JSX.Element {
  return (
    <article className={styles['card']} aria-labelledby={`mcp-request-${request.requestId}`}>
      <div className={styles['header']}>
        <div>
          <p className={styles['eyebrow']}>MCP mutation approval</p>
          <h2 id={`mcp-request-${request.requestId}`}>{request.toolName}</h2>
        </div>
        <span className={`${styles['risk']} ${styles[riskTier.toLowerCase()]}`}>{riskTier} risk</span>
      </div>

      <p className={styles['warning']}>
        Review this request before it runs. A host&apos;s confirmation and tool-provided annotations
        are not authorization.
      </p>

      <dl className={styles['details']}>
        <div><dt>Requesting client</dt><dd>{request.clientName}</dd></div>
        <div><dt>Principal</dt><dd><code>{request.principalId}</code></dd></div>
        <div><dt>Scopes</dt><dd>{request.scopes.length > 0 ? request.scopes.join(', ') : 'None declared'}</dd></div>
        <div><dt>Arguments</dt><dd><pre>{JSON.stringify(request.args, null, 2)}</pre></dd></div>
      </dl>

      <div className={styles['actions']}>
        <button type="button" onClick={() => onDecision(false)} disabled={disabled}>Deny</button>
        <button type="button" className={styles['approve']} onClick={() => onDecision(true)} disabled={disabled}>Approve</button>
      </div>
    </article>
  );
}

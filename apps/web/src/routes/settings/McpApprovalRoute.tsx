import type { JSX } from 'react';

import styles from '../AuthForm.module.css';

/**
 * Approval inbox shell. Pending requests are supplied by the authenticated MCP transport in a
 * later integration; keeping the empty state explicit avoids inventing a mutation or silently
 * approving one while that transport is unavailable.
 */
export function McpApprovalRoute(): JSX.Element {
  return (
    <div className={styles['wrap']} style={{ margin: 0, maxWidth: 'none' }}>
      <h1>MCP approvals</h1>
      <section>
        <h2>No pending requests</h2>
        <p>
          Mutating MCP requests appear here with their requesting client, principal, scopes,
          arguments, and operation-derived risk before they can run.
        </p>
        <p>
          Patches records only the decision metadata and an argument digest. Tool annotations and
          confirmations shown by an MCP host never authorize a mutation.
        </p>
      </section>
    </div>
  );
}

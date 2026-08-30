import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { McpApprovalCard } from './McpApprovalCard.js';

describe('McpApprovalCard', () => {
  it('shows the complete provenance context and emits explicit decisions', () => {
    const onDecision = vi.fn();
    render(
      <McpApprovalCard
        request={{
          requestId: 'request-1',
          clientName: 'Patchwork Desktop',
          principalId: 'actor-1',
          scopes: ['posts:write', 'media:read'],
          toolName: 'publish_post',
          args: { body: 'visible only in this review surface' },
          isMutation: true,
        }}
        riskTier="HIGH"
        onDecision={onDecision}
      />,
    );

    expect(screen.getByText('Patchwork Desktop')).toBeInTheDocument();
    expect(screen.getByText('actor-1')).toBeInTheDocument();
    expect(screen.getByText('posts:write, media:read')).toBeInTheDocument();
    expect(screen.getByText(/visible only in this review surface/)).toBeInTheDocument();
    expect(screen.getByText('HIGH risk')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onDecision).toHaveBeenNthCalledWith(1, false);
    expect(onDecision).toHaveBeenNthCalledWith(2, true);
  });
});

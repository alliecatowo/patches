import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { InboxRow } from '../e2ee/runtime.js';
import { MessageList } from './MessageList.js';

function messageRow(
  id: string,
  senderLabel: string,
  body: string,
  sentByViewer: boolean,
): InboxRow {
  return { kind: 'message', id, senderLabel, body, sentByViewer };
}

describe('MessageList', () => {
  it('groups consecutive bubbles from the same sender under one label', () => {
    const rows: InboxRow[] = [
      messageRow('m1', 'violet', 'hey', false),
      messageRow('m2', 'violet', 'you there?', false),
      messageRow('m3', 'you', 'yep', true),
    ];
    render(<MessageList rows={rows} initialUnreadCount={0} />);

    // "violet" label appears once even though it sent two consecutive bubbles.
    expect(screen.getAllByText('violet')).toHaveLength(1);
    expect(screen.getByText('hey')).toBeInTheDocument();
    expect(screen.getByText('you there?')).toBeInTheDocument();
    expect(screen.getByText('yep')).toBeInTheDocument();
  });

  it('places an unread divider before the last N rows matching the unread snapshot', () => {
    const rows: InboxRow[] = [
      messageRow('m1', 'violet', 'old', false),
      messageRow('m2', 'violet', 'new one', false),
    ];
    render(<MessageList rows={rows} initialUnreadCount={1} />);

    expect(screen.getByRole('separator', { name: 'Unread messages' })).toBeInTheDocument();
  });

  it('renders a log role for the thread so screen readers announce new messages', () => {
    render(<MessageList rows={[messageRow('m1', 'violet', 'hi', false)]} initialUnreadCount={0} />);
    expect(screen.getByRole('log', { name: 'Messages' })).toBeInTheDocument();
  });
});

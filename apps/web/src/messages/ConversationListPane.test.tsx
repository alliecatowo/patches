import { ConversationSecurityMode, type Actor, type Conversation } from '@patches/proto/es';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ConversationListPane } from './ConversationListPane.js';

function conversation(id: string, handle: string, unreadCount = 0): Conversation {
  return {
    id,
    securityMode: ConversationSecurityMode.E2EE_V1,
    unreadCount,
    members: [
      { actor: { id: 'actor-me', handle: 'allie' } as unknown as Actor },
      { actor: { id: `actor-${handle}`, handle } as unknown as Actor },
    ],
  } as unknown as Conversation;
}

function renderPane(props: Partial<Parameters<typeof ConversationListPane>[0]> = {}): void {
  const tree: ReactElement = (
    <MemoryRouter>
      <ConversationListPane
        conversations={[]}
        viewerActorId="actor-me"
        isPending={false}
        pollFailed={false}
        canCompose
        onNewMessage={vi.fn()}
        {...props}
      />
    </MemoryRouter>
  );
  render(tree);
}

describe('ConversationListPane', () => {
  it('shows the invite-to-start empty state with a primary compose action', () => {
    const onNewMessage = vi.fn();
    renderPane({ onNewMessage });

    expect(screen.getByText('No conversations yet — start one.')).toBeInTheDocument();
    screen.getByRole('button', { name: /Start a conversation/ }).click();
    expect(onNewMessage).toHaveBeenCalled();
  });

  it('renders an unread badge and avatar initial for each conversation', () => {
    renderPane({ conversations: [conversation('conv-1', 'violet', 3)] });

    expect(screen.getByText('@violet')).toBeInTheDocument();
    expect(screen.getByLabelText('3 unread')).toBeInTheDocument();
  });

  it('states a failed refresh instead of claiming the inbox is empty', () => {
    renderPane({ conversations: [], pollFailed: true });

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load conversations.');
    expect(screen.queryByText('No conversations yet — start one.')).not.toBeInTheDocument();
  });
});

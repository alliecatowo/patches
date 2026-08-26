import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { scenario, signedInAs } from '../../.storybook/decorators.js';
import { conversationListFixture, viewerActor } from '../../.storybook/fixtures.js';
import { setStoryConversations } from '../../.storybook/mocks/apiClient.js';
import { MessagesRoute } from './MessagesRoute.js';

const meta = {
  title: 'Routes/Messages',
  component: MessagesRoute,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={['/messages']}>
        <Routes>
          <Route path="/messages" element={<Story />} />
          <Route path="/messages/:id" element={null} />
        </Routes>
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof MessagesRoute>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The DM list: three synthetic conversations. Fixtures carry metadata only (handles,
 * unread counts, timestamps) — never message bodies (spec §183.1; v0 DMs are
 * server-visible and the route renders that disclosure itself, as the story shows).
 */
export const ConversationList: Story = {
  decorators: [
    signedInAs(viewerActor),
    scenario(() => setStoryConversations(conversationListFixture())),
  ],
};

export const EmptyInbox: Story = {
  decorators: [signedInAs(viewerActor), scenario(() => setStoryConversations([]))],
};

/**
 * The §183.1 disclosure and E2EE mode labels are inseparable from the rows — a play
 * assertion keeps that contract pinned: no row renders without the disclosure above it.
 */
export const DisclosureContract: Story = {
  decorators: [
    signedInAs(viewerActor),
    scenario(() => setStoryConversations(conversationListFixture())),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText('@fixture-friend')).toBeInTheDocument();
    const notes = canvas.getAllByRole('note');
    expect(notes.length).toBeGreaterThan(0);
    expect(canvas.getAllByText('E2EE').length).toBe(3);
  },
};

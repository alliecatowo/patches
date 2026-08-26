import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { scenario, signedInAs } from '../../.storybook/decorators.js';
import { conversationListFixture, viewerActor } from '../../.storybook/fixtures.js';
import { setStoryConversations } from '../../.storybook/mocks/apiClient.js';
import { MessageThreadRoute } from './MessageThreadRoute.js';

const meta = {
  title: 'Routes/Message Thread',
  component: MessageThreadRoute,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={['/messages/conv-1']}>
        <Routes>
          <Route path="/messages/:id" element={<Story />} />
        </Routes>
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof MessageThreadRoute>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A fresh browser has no enrolled messaging device and no decrypted history, so the
 * thread shows exactly what production shows in that state: the §183.1 server-visible
 * disclosure, the not-enrolled note, and the session-setup-unavailable copy. No message
 * bodies exist in any fixture (they cannot — nothing here can decrypt them, by design).
 */
export const NotEnrolled: Story = {
  decorators: [
    signedInAs(viewerActor),
    scenario(() => setStoryConversations(conversationListFixture())),
  ],
};

/** An unknown conversation id: the honest "could not be loaded" state, never a fake one. */
export const MissingConversation: Story = {
  decorators: [signedInAs(viewerActor), scenario(() => setStoryConversations([]))],
  render: () => (
    <MemoryRouter initialEntries={['/messages/conv-missing']}>
      <Routes>
        <Route path="/messages/:id" element={<MessageThreadRoute />} />
      </Routes>
    </MemoryRouter>
  ),
};

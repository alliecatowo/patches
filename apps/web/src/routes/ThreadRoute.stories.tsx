import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { scenario } from '../../.storybook/decorators.js';
import { makePost, threadFixture } from '../../.storybook/fixtures.js';
import { setStoryPosts, setStoryReplies } from '../../.storybook/mocks/apiClient.js';
import { ThreadRoute } from './ThreadRoute.js';

const meta = {
  title: 'Routes/Thread',
  component: ThreadRoute,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={['/p/thread-root']}>
        <Routes>
          <Route path="/p/:id" element={<Story />} />
        </Routes>
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof ThreadRoute>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Root + two chronological replies + the sticky quick-reply composer. */
export const RootWithReplies: Story = {
  decorators: [
    scenario(() => {
      const { root, replies } = threadFixture();
      setStoryPosts([root]);
      setStoryReplies(replies);
    }),
  ],
};

/** A reply-less thread: just the focused post and the composer. */
export const NoReplies: Story = {
  decorators: [
    scenario(() => {
      setStoryPosts([threadFixture().root]);
      setStoryReplies([]);
    }),
  ],
};

/** A CW-gated root: the whole focused post starts collapsed behind the warning. */
export const ContentWarningRoot: Story = {
  decorators: [
    scenario(() => {
      setStoryPosts([
        makePost({
          id: 'thread-root',
          body: 'The focused root stays collapsed behind its content warning.',
          contentWarning: 'spoiler: fixture thread',
        }),
      ]);
      setStoryReplies([]);
    }),
  ],
};

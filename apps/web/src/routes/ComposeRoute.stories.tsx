import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { scenario } from '../../.storybook/decorators.js';
import { threadFixture } from '../../.storybook/fixtures.js';
import { setStoryPosts } from '../../.storybook/mocks/apiClient.js';
import { ComposeRoute } from './ComposeRoute.js';

/** Mounts the story under a compose route carrying the given query string. */
function atComposeUrl(search: string): Decorator {
  return (Story) => (
    <MemoryRouter initialEntries={[`/compose${search}`]}>
      <Routes>
        <Route path="/compose" element={<Story />} />
        <Route
          path="/p/:id"
          element={<p style={{ padding: '1rem' }}>navigated to the new fixture post</p>}
        />
      </Routes>
    </MemoryRouter>
  );
}

const meta = {
  title: 'Routes/Compose',
  component: ComposeRoute,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [atComposeUrl('')],
} satisfies Meta<typeof ComposeRoute>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyDraft: Story = {};

/** The full composer: markdown toolbar, CW toggle, radial counter, preview mode. */
export const Typing: Story = {
  decorators: [
    scenario(() => {
      setStoryPosts([threadFixture().root]);
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const textarea = await canvas.findByPlaceholderText("What's on your mind?");
    await userEvent.type(textarea, 'A **fixture** post typed by the storybook play function.');
    expect(canvas.getByRole('button', { name: 'Post' })).toBeEnabled();
  },
};

/** Quote mode (`?quote=`): the quoted post box pins the context above the textarea. */
export const Quote: Story = {
  decorators: [
    scenario(() => {
      setStoryPosts([threadFixture().root]);
    }),
    atComposeUrl('?quote=thread-root'),
  ],
};

/** The CW toggle opens the warning input and the counter turns amber near the limit. */
export const ContentWarning: Story = {
  decorators: [
    scenario(() => {
      setStoryPosts([threadFixture().root]);
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByPlaceholderText("What's on your mind?");
    await userEvent.click(canvas.getByTitle('Toggle content warning'));
    await canvas.findByLabelText('Content warning description');
    await userEvent.type(
      canvas.getByLabelText('Content warning description'),
      'spoiler: fixture warning',
    );
  },
};

/** Preview mode renders the draft through the real RichBody renderer. */
export const Preview: Story = {
  decorators: [
    scenario(() => {
      setStoryPosts([threadFixture().root]);
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const textarea = await canvas.findByPlaceholderText("What's on your mind?");
    await userEvent.type(textarea, 'preview renders **strong** and #tags');
    await userEvent.click(canvas.getByRole('button', { name: /preview/i }));
    await expect(await canvas.findByText('strong')).toBeInTheDocument();
  },
};

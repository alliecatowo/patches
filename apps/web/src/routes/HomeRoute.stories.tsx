import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import { scenario } from '../../.storybook/decorators.js';
import { localFeedFixture } from '../../.storybook/fixtures.js';
import { setStoryLocalFeed, setStoryNodeInfo } from '../../.storybook/mocks/apiClient.js';
import { HomeRoute } from './HomeRoute.js';

const meta = {
  title: 'Routes/Home',
  component: HomeRoute,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof HomeRoute>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Route-level story: TanStack Query runs for real against the mocked client (the same
 * `createFakeApi`-style fixtures the route tests use). Stories are permanently signed
 * out, so this always renders the signed-out "Everyone here" leg.
 */
export const PublicLocalFeed: Story = {
  decorators: [
    scenario(() => {
      setStoryNodeInfo(true);
      setStoryLocalFeed(localFeedFixture());
    }),
  ],
};

export const InviteOnlyNode: Story = {
  decorators: [
    scenario(() => {
      setStoryNodeInfo(false);
    }),
  ],
};

export const EmptyLocalFeed: Story = {
  decorators: [
    scenario(() => {
      setStoryNodeInfo(true);
      setStoryLocalFeed([]);
    }),
  ],
};

/** The timeline's empty state is stated as such — never as a failed load. */
export const EmptyStateCopy: Story = {
  decorators: [
    scenario(() => {
      setStoryNodeInfo(true);
      setStoryLocalFeed([]);
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText('No posts on this node yet.')).toBeInTheDocument();
  },
};

import type { Meta, StoryObj } from '@storybook/react-vite';

import { localFeedFixture } from '../../.storybook/fixtures.js';
import { setStoryNodeInfo, setStoryLocalFeed } from '../../.storybook/mocks/apiClient.js';
import { HomeRoute } from './HomeRoute.js';

const meta = {
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
    (Story) => {
      setStoryNodeInfo(true);
      setStoryLocalFeed(localFeedFixture());
      return <Story />;
    },
  ],
};

export const InviteOnlyNode: Story = {
  decorators: [
    (Story) => {
      setStoryNodeInfo(false);
      return <Story />;
    },
  ],
};

export const EmptyLocalFeed: Story = {
  decorators: [
    (Story) => {
      setStoryNodeInfo(true);
      setStoryLocalFeed([]);
      return <Story />;
    },
  ],
};

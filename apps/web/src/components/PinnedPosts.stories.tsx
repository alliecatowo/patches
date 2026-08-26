import type { Meta, StoryObj } from '@storybook/react-vite';

import { scenario } from '../../.storybook/decorators.js';
import { makeActor, makePost, threadFixture } from '../../.storybook/fixtures.js';
import { setStoryActor, setStoryPosts } from '../../.storybook/mocks/apiClient.js';
import { PinnedPosts } from './PinnedPosts.js';

const meta = {
  title: 'Design System/PinnedPosts',
  component: PinnedPosts,
  argTypes: {
    ownerActorId: { control: 'text' },
  },
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof PinnedPosts>;

export default meta;
type Story = StoryObj<typeof meta>;

const { root, replies } = threadFixture();
const pinned = [
  makePost({ id: 'pin-1', body: 'A **pinned** fixture post — first of the strip.' }),
  replies[1] ?? makePost({ id: 'pin-2', body: 'second pin' }),
];

export const TwoPinnedPosts: Story = {
  args: { ownerActorId: 'actor-1' },
  decorators: [
    scenario(() => {
      setStoryActor(
        makeActor({ id: 'actor-1', handle: 'allie', pinnedPostIds: ['pin-1', pinned[1]!.id] }),
      );
      setStoryPosts(pinned);
    }),
  ],
};

/** Three pins is the spec §188 cap — the strip must hold all of them. */
export const ThreePinnedPosts: Story = {
  args: { ownerActorId: 'actor-1' },
  decorators: [
    scenario(() => {
      setStoryActor(
        makeActor({
          id: 'actor-1',
          handle: 'allie',
          pinnedPostIds: ['pin-1', 'pin-2', 'pin-3'],
        }),
      );
      setStoryPosts([...pinned, makePost({ id: 'pin-3', body: 'Third pinned fixture. #patches' })]);
    }),
  ],
};

/** No pins — the whole strip (heading included) renders nothing. */
export const NoPins: Story = {
  args: { ownerActorId: 'actor-1' },
  decorators: [
    scenario(() => {
      setStoryActor(makeActor({ id: 'actor-1', handle: 'allie', pinnedPostIds: [] }));
      setStoryPosts([root]);
    }),
  ],
  render: (args) => (
    <div>
      <PinnedPosts {...args} />
      <p style={{ color: 'var(--fg-muted)' }}>(the pinned strip renders nothing above)</p>
    </div>
  ),
};

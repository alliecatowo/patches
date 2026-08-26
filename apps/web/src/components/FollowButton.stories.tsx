import { FollowState } from '@patches/proto/es';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import type { ReactNode } from 'react';

import { scenario, signedInAs } from '../../.storybook/decorators.js';
import { viewerActor } from '../../.storybook/fixtures.js';
import { setStoryRelationship } from '../../.storybook/mocks/apiClient.js';
import { FollowButton } from './FollowButton.js';

const meta = {
  title: 'Design System/FollowButton',
  component: FollowButton,
  argTypes: {
    actorId: { control: 'text' },
  },
} satisfies Meta<typeof FollowButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Frames the button so its `null` states are legible instead of a blank canvas. */
function Frame({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '1rem' }}>
      <strong style={{ font: 'inherit' }}>@fixture-friend</strong>
      {children}
    </div>
  );
}

export const NotFollowing: Story = {
  args: { actorId: 'actor-friend' },
  decorators: [
    signedInAs(viewerActor),
    scenario(() => setStoryRelationship('actor-friend', FollowState.NONE)),
  ],
  render: (args) => (
    <Frame>
      <FollowButton {...args} />
    </Frame>
  ),
};

export const Following: Story = {
  args: { actorId: 'actor-friend' },
  decorators: [
    signedInAs(viewerActor),
    scenario(() => setStoryRelationship('actor-friend', FollowState.FOLLOWING)),
  ],
  render: (args) => (
    <Frame>
      <FollowButton {...args} />
    </Frame>
  ),
};

export const Requested: Story = {
  args: { actorId: 'actor-friend' },
  decorators: [
    signedInAs(viewerActor),
    scenario(() => setStoryRelationship('actor-friend', FollowState.PENDING)),
  ],
  render: (args) => (
    <Frame>
      <FollowButton {...args} />
    </Frame>
  ),
};

/** Signed out (or viewing your own profile) the button renders nothing at all. */
export const SignedOut: Story = {
  args: { actorId: 'actor-friend' },
  decorators: [scenario()],
  render: (args) => (
    <Frame>
      <FollowButton {...args} />
      <span style={{ color: 'var(--fg-muted)' }}>(nothing renders here when signed out)</span>
    </Frame>
  ),
};

/** The mock keeps follow/unfollow stateful, so the label really flips on click. */
export const ToggleByClick: Story = {
  args: { actorId: 'actor-friend' },
  decorators: [
    signedInAs(viewerActor),
    scenario(() => setStoryRelationship('actor-friend', FollowState.NONE)),
  ],
  render: (args) => (
    <Frame>
      <FollowButton {...args} />
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const follow = await canvas.findByRole('button', { name: 'Follow' });
    await userEvent.click(follow);
    await expect(await canvas.findByRole('button', { name: 'Following' })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Following' }));
    await expect(await canvas.findByRole('button', { name: 'Follow' })).toBeInTheDocument();
  },
};

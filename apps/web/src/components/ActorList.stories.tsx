import type { Actor } from '@patches/proto/es';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { scenario, signedInAs } from '../../.storybook/decorators.js';
import {
  friendActor,
  gradientNameplate,
  makeActor,
  photoDataUri,
  remoteActor,
  viewerActor,
} from '../../.storybook/fixtures.js';
import { ActorList } from './ActorList.js';

const actorsWithAvatar: Actor[] = [
  makeActor({
    id: 'actor-friend',
    handle: 'fixture-friend',
    displayName: 'Fixture Friend',
    bio: 'a synthetic account that exists only inside Storybook fixtures',
    avatar: { url: photoDataUri('F', '#2f855a') } as Actor['avatar'],
  }),
  makeActor({
    id: 'actor-remote',
    handle: 'nomad',
    displayName: 'Nomad',
    homeServer: 'other.example',
    nameplate: gradientNameplate,
  }),
  makeActor({
    id: 'actor-bare',
    handle: 'fixture-bare',
    displayName: '',
    bio: 'no display name — the handle carries the row',
  }),
];

const meta = {
  title: 'Design System/ActorList',
  component: ActorList,
  argTypes: {
    emptyMessage: { control: 'text' },
    loading: { control: 'boolean' },
  },
} satisfies Meta<typeof ActorList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    actors: actorsWithAvatar,
    emptyMessage: 'No one here yet.',
  },
  decorators: [signedInAs(viewerActor)],
};

export const LoadingSkeleton: Story = {
  args: {
    actors: [],
    loading: true,
    emptyMessage: 'No one here yet.',
  },
};

export const Empty: Story = {
  args: {
    actors: [],
    emptyMessage: 'No followers yet.',
  },
};

/** Signed out: rows render, but every FollowButton slot is gone (they return null). */
export const SignedOut: Story = {
  args: {
    actors: [friendActor, remoteActor],
    emptyMessage: 'No one here yet.',
  },
  decorators: [scenario()],
};

/** A long list exercises scroll and repetition — switch viewports to check row wrap. */
export const ManyActors: Story = {
  args: {
    actors: Array.from({ length: 12 }, (_, i) =>
      makeActor({
        id: `actor-many-${i}`,
        handle: `fixture-${i}`,
        displayName: `Fixture Number ${i}`,
        bio: i % 3 === 0 ? 'row with a bio attached' : '',
      }),
    ),
    emptyMessage: 'No one here yet.',
  },
  decorators: [signedInAs(viewerActor)],
};

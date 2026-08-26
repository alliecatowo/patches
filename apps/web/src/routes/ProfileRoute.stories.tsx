import type { Actor } from '@patches/proto/es';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { scenario, signedInAs } from '../../.storybook/decorators.js';
import {
  gradientNameplate,
  localFeedFixture,
  makeActor,
  makePost,
  photoDataUri,
  pageDocumentFixture,
  viewerActor,
} from '../../.storybook/fixtures.js';
import {
  setStoryActor,
  setStoryActorPosts,
  setStoryFollowLists,
  setStoryPageDocument,
  setStoryPosts,
} from '../../.storybook/mocks/apiClient.js';
import { ProfileRoute } from './ProfileRoute.js';

const meta = {
  title: 'Routes/Profile',
  component: ProfileRoute,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={['/@allie']}>
        <Routes>
          <Route path="/@:handle" element={<Story />} />
        </Routes>
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof ProfileRoute>;

export default meta;
type Story = StoryObj<typeof meta>;

const profileActor = makeActor({
  id: 'actor-1',
  handle: 'allie',
  displayName: 'Allie',
  bio: 'Fixture bio with **markup**, a #tag and a mention of @fixture-friend.',
  locationText: 'a terminal somewhere',
  websiteUrl: 'https://example.com/fixture',
  counts: { posts: 42, followers: 7, following: 3 } as unknown as Actor['counts'],
  nameplate: gradientNameplate,
  avatar: { url: photoDataUri('A', '#6b46c1') } as unknown as Actor['avatar'],
});

/** The full profile: header, tabs, pinned strip (wall tab), posts timeline. */
export const FullProfile: Story = {
  decorators: [
    signedInAs(viewerActor),
    scenario(() => {
      setStoryActor(profileActor);
      setStoryActorPosts(localFeedFixture());
      setStoryFollowLists(
        [makeActor({ id: 'actor-f1', handle: 'fixture-fan', displayName: 'Fixture Fan' })],
        [makeActor({ id: 'actor-f2', handle: 'fixture-muse', displayName: 'Fixture Muse' })],
      );
      setStoryPageDocument(pageDocumentFixture());
      setStoryPosts([
        makePost({ id: 'pin-1', body: 'A **pinned** fixture post on the wall tab.' }),
      ]);
    }),
  ],
};

/** Viewing your own profile: no FollowButton, but the Edit Wall affordance is there. */
export const OwnProfile: Story = {
  decorators: [
    signedInAs(profileActor),
    scenario(() => {
      setStoryActor(profileActor);
      setStoryActorPosts(localFeedFixture());
      setStoryFollowLists([], []);
      setStoryPageDocument(pageDocumentFixture());
    }),
  ],
};

/** Signed out: same page minus session-gated controls. */
export const SignedOut: Story = {
  decorators: [
    scenario(() => {
      setStoryActor(profileActor);
      setStoryActorPosts(localFeedFixture());
    }),
  ],
};

/** No posts yet: the timeline's empty state, not an error. */
export const EmptyProfile: Story = {
  decorators: [
    scenario(() => {
      setStoryActor(
        makeActor({ id: 'actor-empty', handle: 'fixture-new', displayName: 'Fixture New' }),
      );
      setStoryActorPosts([]);
      setStoryFollowLists([], []);
    }),
  ],
};

/** An avatarless, bioless, countless actor: every optional section degrades silently. */
export const BareProfile: Story = {
  decorators: [
    scenario(() => {
      setStoryActor(makeActor({ id: 'actor-bare', handle: 'fixture-bare', displayName: '' }));
      setStoryActorPosts([]);
      setStoryFollowLists([], []);
    }),
  ],
};

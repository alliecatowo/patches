import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import {
  gradientNameplate,
  makeActor,
  makeMedia,
  makePost,
  photoDataUri,
  singleColorNameplate,
} from '../../.storybook/fixtures.js';
import { registerStorybookMedia } from '../../.storybook/mocks/apiClient.js';
import { PostCard } from './PostCard.js';

registerStorybookMedia('tile-aurora', photoDataUri('aurora', '#6b46c1'));
registerStorybookMedia('tile-forest', photoDataUri('forest', '#2f855a'));

const meta = {
  title: 'Design System/PostCard',
  component: PostCard,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof PostCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    post: makePost({
      body: 'Hello from the **Storybook** fixture — try the viewport toolbar: #mobilePwa, #tablet, #desktop.',
    }),
  },
};

export const NameplateAuthor: Story = {
  args: {
    post: makePost({
      author: makeActor({ nameplate: gradientNameplate }),
      body: 'The gradient nameplate and glyph ride along on the display name (B-129).',
    }),
  },
};

export const ContentWarning: Story = {
  args: {
    post: makePost({
      body: 'The body stays collapsed behind the CW button until it is expanded.',
      contentWarning: 'spoiler: phase 3 plans',
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Collapsed by default: the warning row is visible, the body is not…
    const reveal = await canvas.findByText(/show post/);
    expect(canvas.queryByText(/collapsed behind the CW button/)).not.toBeInTheDocument();
    // …and one tap reveals it in place.
    await userEvent.click(reveal);
    expect(await canvas.findByText(/collapsed behind the CW button/)).toBeInTheDocument();
  },
};

export const RemoteQuote: Story = {
  args: {
    post: makePost({
      body: 'Quoting a remote post renders the full @handle@home-server attribution (B-180).',
      quotedPost: makePost({
        id: 'quoted-1',
        body: 'A quoted remote post.',
        author: makeActor({
          id: 'actor-traveler',
          handle: 'traveler',
          displayName: 'Traveler',
          homeServer: 'other.example',
          nameplate: singleColorNameplate,
        }),
      }),
    }),
  },
};

export const RepostedContext: Story = {
  args: {
    post: makePost({
      repostedByTotal: 1,
      repostedBy: [
        makeActor({
          id: 'actor-nomad',
          handle: 'nomad',
          displayName: 'Nomad',
          homeServer: 'other.example',
        }),
      ],
      body: 'Reposted by a remote actor — the context row shows @nomad@other.example.',
    }),
  },
};

export const WithMedia: Story = {
  args: {
    post: makePost({
      body: 'Two attachments render in the media grid; opening one raises the lightbox.',
      media: [
        ...makeMedia('tile-aurora', 'Purple placeholder tile reading tile-aurora'),
        ...makeMedia('tile-forest', 'Green placeholder tile reading tile-forest'),
      ],
    }),
  },
};

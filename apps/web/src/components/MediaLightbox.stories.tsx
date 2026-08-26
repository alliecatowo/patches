import type { Meta, StoryObj } from '@storybook/react-vite';

import { photoDataUri } from '../../.storybook/fixtures.js';
import { MediaLightbox } from './MediaLightbox.js';

const meta = {
  component: MediaLightbox,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof MediaLightbox>;

export default meta;
type Story = StoryObj<typeof meta>;

const images = [
  { mediaId: 'lb-1', url: photoDataUri('aurora', '#6b46c1'), altText: 'Purple placeholder tile' },
  { mediaId: 'lb-2', url: photoDataUri('forest', '#2f855a'), altText: 'Green placeholder tile' },
  { mediaId: 'lb-3', url: photoDataUri('ocean', '#2b6cb0'), altText: 'Blue placeholder tile' },
];

export const ThreeImages: Story = {
  args: {
    images,
    initialIndex: 0,
    isOpen: true,
    onClose: () => undefined,
  },
};

export const SecondImage: Story = {
  args: {
    images,
    initialIndex: 1,
    isOpen: true,
    onClose: () => undefined,
  },
};

export const SingleImage: Story = {
  args: {
    images: [
      images[0] ?? {
        mediaId: 'lb-1',
        url: photoDataUri('aurora', '#6b46c1'),
        altText: 'Purple placeholder tile',
      },
    ],
    initialIndex: 0,
    isOpen: true,
    onClose: () => undefined,
  },
};

import type { Meta, StoryObj } from '@storybook/react-vite';

import { EditWallDialog } from './EditWallDialog.js';

const meta = {
  title: 'Patterns/Edit Wall Dialog',
  component: EditWallDialog,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof EditWallDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

const existingWall = new TextEncoder().encode(
  JSON.stringify({
    version: 1,
    pages: [
      {
        slug: 'home',
        title: 'Home',
        blocks: [
          { type: 'Text', body: 'existing wall text' },
          { type: 'AsciiArt', art: '  ___  \n |___| \n |___| ' },
          { type: 'Hero', title: 'hello, traveler', subtitle: 'chronological or nothing' },
        ],
      },
    ],
  }),
);

export const WithExistingWall: Story = {
  args: {
    isOpen: true,
    onClose: () => undefined,
    handle: 'allie',
    currentDocument: existingWall,
  },
};

export const EmptyWall: Story = {
  args: {
    isOpen: true,
    onClose: () => undefined,
    handle: 'allie',
  },
};

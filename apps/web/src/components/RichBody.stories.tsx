import type { Meta, StoryObj } from '@storybook/react-vite';

import { RichBody } from './RichBody.js';

const meta = {
  title: 'Design System/RichBody',
  component: RichBody,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof RichBody>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Exercises every inline construct the shared grammar is verified for (RichBody.test):
 * strong, emphasis, #tag, @mention, bare URL, and hard line breaks. */
export const InlineFormatting: Story = {
  args: {
    source:
      'this is **bold** and *italic*, tagging #patches, mentioning @allie,\nand linking https://example.com/x — plus a hard break above.',
  },
};

export const PlainText: Story = {
  args: {
    source: 'A plain paragraph. The same renderer serves posts and profile bios.',
  },
};

export const LongBody: Story = {
  args: {
    source: Array.from({ length: 6 }, (_, i) => `Paragraph ${i + 1} of a long post body.`).join(
      '\n\n',
    ),
  },
};

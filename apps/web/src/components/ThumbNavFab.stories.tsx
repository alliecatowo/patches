import type { Meta, StoryObj } from '@storybook/react-vite';

import { ThumbNavFab } from './ThumbNavFab.js';

const meta = {
  component: ThumbNavFab,
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    unreadCount: { control: 'number' },
  },
} satisfies Meta<typeof ThumbNavFab>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The FAB is hidden at ≥721px (ThumbNavFab.module.css) — switch the viewport toolbar to
 * "Mobile PWA (375×667)" to see it; at "Desktop (1280×800)" it disappears. This is pure
 * CSS media-query behavior: the viewport preset resizes the iframe and does not emulate
 * touch (docs/research/storybook-web.md §3).
 */
export const Default: Story = {};

export const WithUnreadBadge: Story = {
  args: { unreadCount: 12 },
};

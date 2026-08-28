import type { Meta, StoryObj } from '@storybook/react-vite';

import { Skeleton, SkeletonRow } from './Skeleton.js';

const meta = {
  component: Skeleton,
  argTypes: {
    variant: { control: 'select', options: ['text', 'circle', 'rect'] },
  },
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Text: Story = {
  args: { variant: 'text', width: '60%' },
};

export const Circle: Story = {
  args: { variant: 'circle', width: '48px' },
};

export const Rect: Story = {
  args: { variant: 'rect', height: '160px' },
};

export const Row: StoryObj = {
  render: () => <SkeletonRow />,
};

export const RowWithoutAvatar: StoryObj = {
  render: () => <SkeletonRow withAvatar={false} lines={3} />,
};

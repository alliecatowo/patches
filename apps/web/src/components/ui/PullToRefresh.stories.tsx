import type { Meta, StoryObj } from '@storybook/react-vite';

import { PullToRefresh } from './PullToRefresh.js';

/** Storybook can't simulate a real touch-drag gesture in its docs canvas, so this story exists
 * to render the resting state and document the component — the pull gesture itself is covered
 * by the app it's mounted in (`PostTimeline`), not by an interaction test here. */
const meta = {
  component: PullToRefresh,
} satisfies Meta<typeof PullToRefresh>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Resting: Story = {
  args: {
    onRefresh: () => {},
    children: <p style={{ padding: '1rem' }}>Pull down on a touch device to refresh.</p>,
  },
};

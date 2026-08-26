import { DeviceLinkStatus } from '@patches/proto/es';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { scenario } from '../../.storybook/decorators.js';
import {
  setStoryAuthPollInterval,
  setStoryAuthStatuses,
} from '../../.storybook/mocks/apiClient.js';
import { DeviceLinkButton } from './DeviceLinkButton.js';

const meta = {
  title: 'Patterns/Login/Device Link',
  component: DeviceLinkButton,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof DeviceLinkButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};

/** No verification URL in this flow — the viewer approves from their own terminal. */
export const TerminalCommandPanel: Story = {
  decorators: [scenario()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Approve from your terminal' }));
    expect(await canvas.findByText('patches approve ABCD-1234')).toBeInTheDocument();
  },
};

export const Expired: Story = {
  decorators: [
    scenario(() => {
      setStoryAuthStatuses({ device: DeviceLinkStatus.EXPIRED });
      setStoryAuthPollInterval(0.05);
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Approve from your terminal' }));
    expect(await canvas.findByText(/expired before it was approved/i)).toBeInTheDocument();
  },
};

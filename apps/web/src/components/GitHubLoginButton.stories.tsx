import { GitHubLoginStatus } from '@patches/proto/es';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { scenario } from '../../.storybook/decorators.js';
import {
  setStoryAuthPollInterval,
  setStoryAuthStatuses,
} from '../../.storybook/mocks/apiClient.js';
import { GitHubLoginButton } from './GitHubLoginButton.js';

const meta = {
  title: 'Patterns/Login/GitHub',
  component: GitHubLoginButton,
  argTypes: {
    mode: { control: 'radio', options: ['login', 'link'] },
  },
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof GitHubLoginButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};

/** Link mode (spec §167): same RPC pair, no navigation on completion. */
export const LinkModeIdle: Story = {
  args: { mode: 'link' },
};

/** The device-flow panel: verification URL, user code, copy + cancel. */
export const CodePanel: Story = {
  decorators: [scenario()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Sign in with GitHub' }));
    expect(await canvas.findByText('ABCD-1234')).toBeInTheDocument();
    expect(
      canvas.getByRole('link', { name: 'https://github.com/login/device' }),
    ).toBeInTheDocument();
  },
};

/** Terminal states the poll can land in — each shows its fixed retry copy. */
export const Expired: Story = {
  decorators: [
    scenario(() => {
      setStoryAuthStatuses({ github: GitHubLoginStatus.EXPIRED });
      setStoryAuthPollInterval(0.05);
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Sign in with GitHub' }));
    expect(await canvas.findByText(/expired before it was used/i)).toBeInTheDocument();
  },
};

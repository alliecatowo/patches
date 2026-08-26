import { OidcLoginStatus, type OidcProviderInfo } from '@patches/proto/es';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { scenario } from '../../.storybook/decorators.js';
import {
  setStoryAuthPollInterval,
  setStoryAuthStatuses,
} from '../../.storybook/mocks/apiClient.js';
import { OidcLoginButton } from './OidcLoginButton.js';

const fixtureProvider: OidcProviderInfo = {
  $typeName: 'patches.v1.OidcProviderInfo',
  id: 'fixture-idp',
  displayName: 'Fixture IDP',
} as unknown as OidcProviderInfo;

const meta = {
  title: 'Patterns/Login/OIDC',
  component: OidcLoginButton,
  argTypes: {
    mode: { control: 'radio', options: ['login', 'link'] },
  },
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof OidcLoginButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  args: { provider: fixtureProvider },
};

/** One instance per GetAuthPolicy entry — the provider name threads through the label. */
export const CodePanel: Story = {
  args: { provider: fixtureProvider },
  decorators: [scenario()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Sign in with Fixture IDP' }));
    expect(await canvas.findByText('ABCD-1234')).toBeInTheDocument();
    expect(
      canvas.getByRole('link', { name: 'https://github.com/login/device' }),
    ).toBeInTheDocument();
  },
};

export const Denied: Story = {
  args: { provider: fixtureProvider },
  decorators: [
    scenario(() => {
      setStoryAuthStatuses({ oidc: OidcLoginStatus.DENIED });
      setStoryAuthPollInterval(0.05);
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Sign in with Fixture IDP' }));
    expect(await canvas.findByText(/denied/i)).toBeInTheDocument();
  },
};

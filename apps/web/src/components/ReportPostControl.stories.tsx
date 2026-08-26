import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { scenario, signedInAs } from '../../.storybook/decorators.js';
import { viewerActor } from '../../.storybook/fixtures.js';
import { ReportPostControl } from './ReportPostControl.js';

const meta = {
  title: 'Feedback/ReportPostControl',
  component: ReportPostControl,
  argTypes: {
    postId: { control: 'text' },
    className: { control: 'text' },
  },
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof ReportPostControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {
  args: { postId: 'post-1' },
  decorators: [signedInAs(viewerActor)],
};

export const SignedOut: Story = {
  args: { postId: 'post-1' },
  decorators: [scenario()],
  render: (args) => (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
      <ReportPostControl {...args} />
      <span style={{ color: 'var(--fg-muted)' }}>(nothing renders when signed out)</span>
    </div>
  ),
};

/** The full flow: open → pick a reason → submit → the fixed acknowledgment. */
export const SubmitAReport: Story = {
  args: { postId: 'post-1' },
  decorators: [signedInAs(viewerActor)],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'report' }));
    const form = await canvas.findByRole('form', { name: 'Report post' });
    await userEvent.selectOptions(within(form).getByLabelText('Report reason'), 'Spam');
    await userEvent.type(within(form).getByLabelText('Report details'), 'fixture details');
    await userEvent.click(within(form).getByRole('button', { name: 'Submit report' }));
    expect(await canvas.findByText('Report sent.')).toBeInTheDocument();
  },
};

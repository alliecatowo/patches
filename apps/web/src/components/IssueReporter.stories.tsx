import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { IssueReporter } from './IssueReporter.js';

const meta = {
  title: 'Feedback/IssueReporter',
  component: IssueReporter,
  argTypes: {
    variant: { control: 'radio', options: ['floating', 'inline'] },
    autoOpen: { control: 'boolean' },
  },
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof IssueReporter>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The bottom-corner chip error boundaries mount. */
export const FloatingChip: Story = {
  args: { variant: 'floating' },
};

/** The Settings entry styling. */
export const InlineEntry: Story = {
  args: { variant: 'inline' },
  render: (args) => (
    <div style={{ padding: '2rem', maxWidth: 360 }}>
      <IssueReporter {...args} />
    </div>
  ),
};

/** Error boundaries auto-open the modal — this is what a crashed route shows. */
export const AutoOpenedModal: Story = {
  args: { variant: 'floating', autoOpen: true },
};

/** The chip really opens the modal; the hint copy states the local-only contract. */
export const OpenByClick: Story = {
  args: { variant: 'inline' },
  render: (args) => (
    <div style={{ padding: '2rem', maxWidth: 360 }}>
      <IssueReporter {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Report an issue' }));
    const dialog = await canvas.findByRole('dialog', { name: 'Report an issue' });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/Message contents are never included/i)).toBeInTheDocument();
  },
};

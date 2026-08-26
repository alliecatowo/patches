import type { Meta, StoryObj } from '@storybook/react-vite';

import { gradientNameplate, makeActor, singleColorNameplate } from '../../.storybook/fixtures.js';
import { Nameplate } from './Nameplate.js';

const meta = {
  title: 'Design System/Nameplate',
  component: Nameplate,
  argTypes: {
    handle: { control: 'text' },
    bold: { control: 'boolean' },
  },
} satisfies Meta<typeof Nameplate>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PlainHandle: Story = {
  args: { handle: makeActor().handle },
};

export const SingleColor: Story = {
  args: { handle: 'allie', nameplate: singleColorNameplate },
};

export const GradientWithGlyph: Story = {
  args: { handle: 'nomad', nameplate: gradientNameplate, bold: true },
};

export const BoldUnstyled: Story = {
  args: { handle: 'sam', bold: true },
};

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type JSX } from 'react';

import { ColorPicker } from './ColorPicker.js';

const SWATCHES = ['#6b46c1', '#a78bfa', '#00ff66', '#ffc2e2', '#6a3dad'];

function ControlledColorPicker(props: { readonly initial: string }): JSX.Element {
  const [value, setValue] = useState(props.initial);
  return (
    <ColorPicker label="Accent colour" value={value} onChange={setValue} swatches={SWATCHES} />
  );
}

const meta = {
  component: ColorPicker,
  argTypes: {
    label: { control: 'text' },
    value: { control: 'text' },
  },
} satisfies Meta<typeof ColorPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unset: Story = {
  args: { label: 'Accent colour', value: '', onChange: () => {} },
};

export const ValidHex: Story = {
  args: { label: 'Accent colour', value: '#6b46c1', onChange: () => {}, swatches: SWATCHES },
};

export const InvalidDraft: Story = {
  args: { label: 'Accent colour', value: '#zzz', onChange: () => {} },
};

export const Interactive: StoryObj = {
  render: () => <ControlledColorPicker initial="#a78bfa" />,
};

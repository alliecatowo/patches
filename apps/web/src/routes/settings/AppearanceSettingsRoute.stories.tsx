import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { AppearanceSettingsRoute } from './AppearanceSettingsRoute.js';

const meta = {
  title: 'Routes/Settings/Appearance',
  component: AppearanceSettingsRoute,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof AppearanceSettingsRoute>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The whole settings surface: theme catalog, layout prefs, PWA card. */
export const Default: Story = {};

/**
 * Theme cards drive the app's real mechanism — clicking one must land on the same
 * `data-theme` the production shell applies (`src/lib/theme.ts`).
 */
export const SwitchTheme: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const darkCard = await canvas.findByRole('radio', { name: 'Dark' });
    await userEvent.click(darkCard);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    const patchesCard = canvas.getByRole('radio', { name: 'Patches' });
    await userEvent.click(patchesCard);
    expect(document.documentElement.getAttribute('data-theme')).toBe('patches');
  },
};

/** The layout preferences (quick-menu fan style, timeline density) persist per device. */
export const LayoutPreferences: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('radio', { name: /Radial fan/i }));
    await userEvent.click(canvas.getByRole('radio', { name: /Compact/i }));
    expect(canvas.getByRole('radio', { name: /Radial fan/i })).toBeChecked();
  },
};

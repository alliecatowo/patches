import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { getThemePreference, setThemePreference } from '../../lib/theme.js';
import { AppearanceSettingsRoute } from './AppearanceSettingsRoute.js';

const STORAGE_KEY = 'patches.web.theme.v1';

describe('AppearanceSettingsRoute', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setThemePreference('system');
  });

  it('renders every theme option with the current preference selected', () => {
    render(<AppearanceSettingsRoute />);

    expect(screen.getByRole('radio', { name: 'Light' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Dark' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Follow system' })).toBeChecked();
  });

  it('choosing a theme persists it and updates <html data-theme> immediately', () => {
    render(<AppearanceSettingsRoute />);

    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(getThemePreference()).toBe('dark');
  });

  it('persists the choice across a remount', () => {
    const { unmount } = render(<AppearanceSettingsRoute />);

    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    unmount();

    render(<AppearanceSettingsRoute />);
    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();
  });

  it('renders its content under both the light and dark themes', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    const light = render(<AppearanceSettingsRoute />);
    expect(screen.getByRole('heading', { name: 'Appearance' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeInTheDocument();
    light.unmount();

    document.documentElement.setAttribute('data-theme', 'dark');
    render(<AppearanceSettingsRoute />);
    expect(screen.getByRole('heading', { name: 'Appearance' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Light' })).toBeInTheDocument();
  });
});

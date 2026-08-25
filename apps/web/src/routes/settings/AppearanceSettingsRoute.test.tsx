import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getThemePreference, setThemePreference } from '../../lib/theme.js';
import {
  getDensityPreference,
  getFanStyle,
  setDensityPreference,
  setFanStyle,
} from '../../lib/interfacePreferences.js';
import { reportAppBadgeOperation } from '../../pwa/appBadgeStatus.js';
import { AppearanceSettingsRoute } from './AppearanceSettingsRoute.js';

const STORAGE_KEY = 'patches.web.theme.v1';
const originalSetAppBadge = Object.getOwnPropertyDescriptor(navigator, 'setAppBadge');
const originalClearAppBadge = Object.getOwnPropertyDescriptor(navigator, 'clearAppBadge');
const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');

function setStandaloneMode(): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(
      (query: string) =>
        ({
          matches: query === '(display-mode: standalone)',
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as MediaQueryList,
    ),
  });
}

function restoreBadgeApi(
  property: 'setAppBadge' | 'clearAppBadge',
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor === undefined) {
    delete (navigator as Navigator & Record<typeof property, unknown>)[property];
  } else {
    Object.defineProperty(navigator, property, descriptor);
  }
}

describe('AppearanceSettingsRoute', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setThemePreference('system');
    setFanStyle('stacked');
    setDensityPreference('cozy');
    reportAppBadgeOperation('idle');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreBadgeApi('setAppBadge', originalSetAppBadge);
    restoreBadgeApi('clearAppBadge', originalClearAppBadge);
    if (originalMatchMedia === undefined) {
      Reflect.deleteProperty(window, 'matchMedia');
    } else {
      Object.defineProperty(window, 'matchMedia', originalMatchMedia);
    }
    reportAppBadgeOperation('idle');
  });

  it('persists client-only menu and density choices', () => {
    render(<AppearanceSettingsRoute />);
    fireEvent.click(screen.getByRole('radio', { name: 'Radial fan' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Compact' }));

    expect(getFanStyle()).toBe('radial');
    expect(getDensityPreference()).toBe('compact');
    expect(document.documentElement).toHaveAttribute('data-fan-style', 'radial');
    expect(document.documentElement).toHaveAttribute('data-density', 'compact');
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

  it('does not claim app badging is enabled when an installed browser lacks the API', () => {
    setStandaloneMode();
    Object.defineProperties(navigator, {
      setAppBadge: { configurable: true, value: undefined },
      clearAppBadge: { configurable: true, value: undefined },
    });

    render(<AppearanceSettingsRoute />);

    expect(screen.getByText(/Patches is installed as a PWA/)).toBeInTheDocument();
    expect(
      screen.getByText(/App icon badges are not available in this browser/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/badging enabled/i)).not.toBeInTheDocument();
  });

  it('reports a rejected badge update separately from install state', () => {
    setStandaloneMode();
    Object.defineProperties(navigator, {
      setAppBadge: { configurable: true, value: vi.fn() },
      clearAppBadge: { configurable: true, value: vi.fn() },
    });
    reportAppBadgeOperation('failed');

    render(<AppearanceSettingsRoute />);

    expect(screen.getByText(/Patches is installed as a PWA/)).toBeInTheDocument();
    expect(screen.getByText(/last badge update was not accepted/)).toBeInTheDocument();
    expect(screen.queryByText(/badging enabled/i)).not.toBeInTheDocument();
  });
});

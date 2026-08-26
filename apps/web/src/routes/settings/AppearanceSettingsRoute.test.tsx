import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getThemePreference, setThemePreference } from '../../lib/theme.js';
import {
  getDensityPreference,
  getFanStyle,
  setDensityPreference,
  setFanStyle,
} from '../../lib/interfacePreferences.js';
import {
  getShakeReportPermission,
  setShakeReportPermission,
} from '../../hooks/useShakeToReport.js';
import { reportAppBadgeOperation } from '../../pwa/appBadgeStatus.js';
import { AppearanceSettingsRoute } from './AppearanceSettingsRoute.js';

const STORAGE_KEY = 'patches.web.theme.v1';
const SHAKE_PERMISSION_STORAGE_KEY = 'patches.web.shake-report-permission.v1';
const originalSetAppBadge = Object.getOwnPropertyDescriptor(navigator, 'setAppBadge');
const originalClearAppBadge = Object.getOwnPropertyDescriptor(navigator, 'clearAppBadge');
const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');

/** Minimal stand-in for iOS Safari's non-standard static `requestPermission` gate. */
class DeviceMotionEventWithPermission {
  static requestPermission: () => Promise<'granted' | 'denied'>;
}

function renderRoute(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <AppearanceSettingsRoute />
    </MemoryRouter>,
  );
}

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
    setShakeReportPermission('unknown');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    restoreBadgeApi('setAppBadge', originalSetAppBadge);
    restoreBadgeApi('clearAppBadge', originalClearAppBadge);
    if (originalMatchMedia === undefined) {
      Reflect.deleteProperty(window, 'matchMedia');
    } else {
      Object.defineProperty(window, 'matchMedia', originalMatchMedia);
    }
    reportAppBadgeOperation('idle');
    setShakeReportPermission('unknown');
  });

  it('persists client-only menu and density choices', () => {
    renderRoute();
    fireEvent.click(screen.getByRole('radio', { name: 'Radial fan' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Compact' }));

    expect(getFanStyle()).toBe('radial');
    expect(getDensityPreference()).toBe('compact');
    expect(document.documentElement).toHaveAttribute('data-fan-style', 'radial');
    expect(document.documentElement).toHaveAttribute('data-density', 'compact');
  });

  it('renders every theme option with the current preference selected', () => {
    renderRoute();

    expect(screen.getByRole('radio', { name: 'Light' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Dark' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Follow system' })).toBeChecked();
  });

  it('choosing a theme persists it and updates <html data-theme> immediately', () => {
    renderRoute();

    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(getThemePreference()).toBe('dark');
  });

  it('persists the choice across a remount', () => {
    const { unmount } = renderRoute();

    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    unmount();

    renderRoute();
    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();
  });

  it('renders its content under both the light and dark themes', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    const light = renderRoute();
    expect(screen.getByRole('heading', { name: 'Appearance' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeInTheDocument();
    light.unmount();

    document.documentElement.setAttribute('data-theme', 'dark');
    renderRoute();
    expect(screen.getByRole('heading', { name: 'Appearance' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Light' })).toBeInTheDocument();
  });

  it('does not claim app badging is enabled when an installed browser lacks the API', () => {
    setStandaloneMode();
    Object.defineProperties(navigator, {
      setAppBadge: { configurable: true, value: undefined },
      clearAppBadge: { configurable: true, value: undefined },
    });

    renderRoute();

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

    renderRoute();

    expect(screen.getByText(/Patches is installed as a PWA/)).toBeInTheDocument();
    expect(screen.getByText(/last badge update was not accepted/)).toBeInTheDocument();
    expect(screen.queryByText(/badging enabled/i)).not.toBeInTheDocument();
  });

  it('shows no shake-to-report control on browsers without the iOS gesture gate', () => {
    vi.unstubAllGlobals();
    renderRoute();

    expect(screen.queryByRole('heading', { name: 'Shake to report' })).not.toBeInTheDocument();
  });

  it('offers a one-tap opt-in on iOS Safari and calls requestPermission from the click', () => {
    const requestPermission = vi.fn().mockResolvedValue('granted');
    vi.stubGlobal(
      'DeviceMotionEvent',
      class {
        static requestPermission = requestPermission;
      },
    );

    renderRoute();

    expect(requestPermission).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Enable shake to report' }));
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it('honestly reports a granted permission as enabled', async () => {
    vi.stubGlobal('DeviceMotionEvent', DeviceMotionEventWithPermission);
    DeviceMotionEventWithPermission.requestPermission = vi.fn().mockResolvedValue('granted');

    renderRoute();
    fireEvent.click(screen.getByRole('button', { name: 'Enable shake to report' }));

    expect(await screen.findByText(/Shake to report is enabled/)).toBeInTheDocument();
    expect(getShakeReportPermission()).toBe('granted');
    expect(window.localStorage.getItem(SHAKE_PERMISSION_STORAGE_KEY)).toBe('granted');
  });

  it('honestly reports a denied permission and points at the always-available reporter — never a silent no-op', async () => {
    vi.stubGlobal('DeviceMotionEvent', DeviceMotionEventWithPermission);
    DeviceMotionEventWithPermission.requestPermission = vi.fn().mockResolvedValue('denied');

    renderRoute();
    fireEvent.click(screen.getByRole('button', { name: 'Enable shake to report' }));

    expect(await screen.findByText(/Shake to report is off/)).toBeInTheDocument();
    expect(screen.getByText(/Motion access was denied/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'report an issue' })).toHaveAttribute(
      'href',
      '/report',
    );
    expect(getShakeReportPermission()).toBe('denied');
  });

  it('persists a granted permission across a remount without re-prompting', async () => {
    vi.stubGlobal('DeviceMotionEvent', DeviceMotionEventWithPermission);
    DeviceMotionEventWithPermission.requestPermission = vi.fn().mockResolvedValue('granted');

    const { unmount } = renderRoute();
    fireEvent.click(screen.getByRole('button', { name: 'Enable shake to report' }));
    await screen.findByText(/Shake to report is enabled/);
    unmount();

    renderRoute();
    expect(screen.getByText(/Shake to report is enabled/)).toBeInTheDocument();
  });

  // B-183: the quick-menu setting is real and propagates live, but `ThumbNavFab` is hidden
  // outright above 720px while /settings/appearance is reachable from the desktop sidebar —
  // so a desktop user changes it and sees nothing, and reports it as broken. The hint and the
  // media query are one contract: if either side moves, this fails rather than silently
  // reverting the surface to a lie.
  it('says the quick-menu setting only affects the narrow-screen floating button', () => {
    renderRoute();

    expect(
      screen.getByText(/only affects|floating button on narrow screens|hidden/i),
    ).toBeInTheDocument();

    // vitest's cwd is the `apps/web` workspace root.
    const css = readFileSync(resolve('src/components/ThumbNavFab.module.css'), 'utf8');
    expect(css).toMatch(
      /@media\s*\(min-width:\s*721px\)\s*\{\s*\.fabContainer\s*\{\s*display:\s*none/,
    );
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getDensityPreference,
  getFanStyle,
  setDensityPreference,
  setFanStyle,
  subscribeDensityPreference,
  subscribeFanStyle,
} from './interfacePreferences.js';

describe('interface preferences', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setFanStyle('stacked');
    setDensityPreference('cozy');
  });

  it('syncs validated cross-tab storage changes into snapshots, subscribers, and attributes', () => {
    const fanListener = vi.fn();
    const densityListener = vi.fn();
    const unsubscribeFan = subscribeFanStyle(fanListener);
    const unsubscribeDensity = subscribeDensityPreference(densityListener);

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'patches.web.fan-style.v1',
        newValue: 'radial',
        storageArea: window.localStorage,
      }),
    );
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'patches.web.density.v1',
        newValue: 'compact',
        storageArea: window.localStorage,
      }),
    );

    expect(getFanStyle()).toBe('radial');
    expect(getDensityPreference()).toBe('compact');
    expect(document.documentElement).toHaveAttribute('data-density', 'compact');
    expect(fanListener).toHaveBeenCalledOnce();
    expect(densityListener).toHaveBeenCalledOnce();
    unsubscribeFan();
    unsubscribeDensity();
  });

  it('ignores invalid cross-tab values without notifying subscribers', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeFanStyle(listener);
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'patches.web.fan-style.v1',
        newValue: 'shuffle-every-time',
        storageArea: window.localStorage,
      }),
    );

    expect(getFanStyle()).toBe('stacked');
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('resets both snapshots and notifies both subscriber sets when another tab clears storage', () => {
    setFanStyle('radial');
    setDensityPreference('compact');
    const fanListener = vi.fn();
    const densityListener = vi.fn();
    const unsubscribeFan = subscribeFanStyle(fanListener);
    const unsubscribeDensity = subscribeDensityPreference(densityListener);

    window.dispatchEvent(
      new StorageEvent('storage', { key: null, newValue: null, storageArea: window.localStorage }),
    );

    expect(getFanStyle()).toBe('stacked');
    expect(getDensityPreference()).toBe('cozy');
    expect(document.documentElement).toHaveAttribute('data-density', 'cozy');
    expect(fanListener).toHaveBeenCalledOnce();
    expect(densityListener).toHaveBeenCalledOnce();
    unsubscribeFan();
    unsubscribeDensity();
  });

  it('defaults to the stacked fan and cozy density', () => {
    expect(getFanStyle()).toBe('stacked');
    expect(getDensityPreference()).toBe('cozy');
  });

  it('persists choices and mirrors them onto the document', () => {
    setFanStyle('radial');
    setDensityPreference('compact');
    expect(window.localStorage.getItem('patches.web.fan-style.v1')).toBe('radial');
    expect(window.localStorage.getItem('patches.web.density.v1')).toBe('compact');
    expect(document.documentElement).toHaveAttribute('data-density', 'compact');
  });
});

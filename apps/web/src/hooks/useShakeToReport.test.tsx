import { renderHook } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getShakeReportPermission,
  requestShakeToReportPermission,
  setShakeReportPermission,
  shakeMagnitudeForTest,
  shakeToReportRequiresGesturePermission,
  useShakeToReport,
} from './useShakeToReport.js';

const STORAGE_KEY = 'patches.web.shake-report-permission.v1';

describe('shake threshold math', () => {
  it('classifies gravity-only readings as calm', () => {
    expect(shakeMagnitudeForTest({ x: 0, y: 0, z: 9.81 })).toBeLessThan(18);
  });
  it('classifies a hard shake as above threshold', () => {
    expect(shakeMagnitudeForTest({ x: 15, y: 4, z: 12 })).toBeGreaterThan(18);
  });
});

function wrapper({ children }: { children: ReactNode }): ReactElement {
  return <MemoryRouter>{children}</MemoryRouter>;
}

/**
 * Minimal stand-in for iOS Safari's non-standard static `requestPermission` gate. jsdom
 * (this test environment) already implements a bare `DeviceMotionEvent` global itself, so
 * every test that needs the iOS-only shape must stub `DeviceMotionEvent` explicitly rather
 * than rely on it being absent — and every test that needs the "no gesture gate" (Android/
 * desktop) shape must stub a bare class with no `requestPermission` at all.
 */
function makeIosDeviceMotionEvent(requestPermission: () => Promise<'granted' | 'denied'>): {
  requestPermission: () => Promise<'granted' | 'denied'>;
} {
  return { requestPermission };
}

describe('useShakeToReport permission gating', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'DeviceMotionEvent');

  beforeEach(() => {
    window.localStorage.clear();
    setShakeReportPermission('unknown');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (originalDescriptor !== undefined) {
      Object.defineProperty(window, 'DeviceMotionEvent', originalDescriptor);
    }
    window.localStorage.clear();
    setShakeReportPermission('unknown');
  });

  it('attaches no listener when DeviceMotionEvent is entirely absent (very old browsers)', () => {
    Reflect.deleteProperty(window, 'DeviceMotionEvent');
    const addSpy = vi.spyOn(window, 'addEventListener');
    renderHook(() => useShakeToReport(), { wrapper });
    expect(addSpy).not.toHaveBeenCalledWith('devicemotion', expect.any(Function));
  });

  it('attaches the listener with no gesture permission needed when requestPermission is absent (Android/Chrome, unchanged)', () => {
    vi.stubGlobal('DeviceMotionEvent', class {});
    const addSpy = vi.spyOn(window, 'addEventListener');
    renderHook(() => useShakeToReport(), { wrapper });
    expect(addSpy).toHaveBeenCalledWith('devicemotion', expect.any(Function));
  });

  it('does not attach the listener on iOS Safari until permission is granted', () => {
    vi.stubGlobal(
      'DeviceMotionEvent',
      makeIosDeviceMotionEvent(() => Promise.resolve('granted')),
    );
    const addSpy = vi.spyOn(window, 'addEventListener');
    renderHook(() => useShakeToReport(), { wrapper });
    expect(addSpy).not.toHaveBeenCalledWith('devicemotion', expect.any(Function));
  });

  it('does not attach the listener after permission is explicitly denied', () => {
    vi.stubGlobal(
      'DeviceMotionEvent',
      makeIosDeviceMotionEvent(() => Promise.resolve('denied')),
    );
    setShakeReportPermission('denied');
    const addSpy = vi.spyOn(window, 'addEventListener');
    renderHook(() => useShakeToReport(), { wrapper });
    expect(addSpy).not.toHaveBeenCalledWith('devicemotion', expect.any(Function));
  });

  it('attaches the listener once permission has been granted', () => {
    vi.stubGlobal(
      'DeviceMotionEvent',
      makeIosDeviceMotionEvent(() => Promise.resolve('granted')),
    );
    setShakeReportPermission('granted');
    const addSpy = vi.spyOn(window, 'addEventListener');
    renderHook(() => useShakeToReport(), { wrapper });
    expect(addSpy).toHaveBeenCalledWith('devicemotion', expect.any(Function));
  });
});

describe('useShakeToReport blurs the active element before navigating (#299)', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'DeviceMotionEvent');

  beforeEach(() => {
    window.localStorage.clear();
    setShakeReportPermission('unknown');
    vi.stubGlobal('DeviceMotionEvent', class {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalDescriptor !== undefined) {
      Object.defineProperty(window, 'DeviceMotionEvent', originalDescriptor);
    }
    window.localStorage.clear();
    setShakeReportPermission('unknown');
  });

  function fireShake(): void {
    for (let i = 0; i < 3; i += 1) {
      window.dispatchEvent(
        Object.assign(new Event('devicemotion'), {
          accelerationIncludingGravity: { x: 30, y: 0, z: 0 },
        }),
      );
    }
  }

  it('blurs a focused input so iOS Undo Typing has nothing to sit on top of', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    expect(document.activeElement).toBe(input);
    const blurSpy = vi.spyOn(input, 'blur');

    renderHook(() => useShakeToReport(), { wrapper });
    fireShake();

    expect(blurSpy).toHaveBeenCalled();
    input.remove();
  });

  it('is a no-op when nothing is focused', () => {
    document.body.focus();
    renderHook(() => useShakeToReport(), { wrapper });
    expect(() => fireShake()).not.toThrow();
  });
});

describe('shakeToReportRequiresGesturePermission', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'DeviceMotionEvent');

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalDescriptor !== undefined) {
      Object.defineProperty(window, 'DeviceMotionEvent', originalDescriptor);
    }
  });

  it('is false when DeviceMotionEvent does not exist', () => {
    Reflect.deleteProperty(window, 'DeviceMotionEvent');
    expect(shakeToReportRequiresGesturePermission()).toBe(false);
  });

  it('is false when DeviceMotionEvent exists but has no requestPermission (Android/Chrome)', () => {
    vi.stubGlobal('DeviceMotionEvent', class {});
    expect(shakeToReportRequiresGesturePermission()).toBe(false);
  });

  it('is true only when the iOS-only static requestPermission method is present', () => {
    vi.stubGlobal(
      'DeviceMotionEvent',
      makeIosDeviceMotionEvent(() => Promise.resolve('granted')),
    );
    expect(shakeToReportRequiresGesturePermission()).toBe(true);
  });
});

describe('requestShakeToReportPermission', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'DeviceMotionEvent');

  beforeEach(() => {
    window.localStorage.clear();
    setShakeReportPermission('unknown');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalDescriptor !== undefined) {
      Object.defineProperty(window, 'DeviceMotionEvent', originalDescriptor);
    }
    window.localStorage.clear();
    setShakeReportPermission('unknown');
  });

  it('is a no-op that never fires the browser prompt when the capability is absent', async () => {
    Reflect.deleteProperty(window, 'DeviceMotionEvent');
    const result = await requestShakeToReportPermission();
    expect(result).toBe('unknown');
    expect(getShakeReportPermission()).toBe('unknown');
  });

  it('persists a granted outcome from the underlying browser API', async () => {
    vi.stubGlobal(
      'DeviceMotionEvent',
      makeIosDeviceMotionEvent(() => Promise.resolve('granted')),
    );

    const result = await requestShakeToReportPermission();

    expect(result).toBe('granted');
    expect(getShakeReportPermission()).toBe('granted');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('granted');
  });

  it('persists a denied outcome — an honest "not enabled" state, not a silent no-op', async () => {
    vi.stubGlobal(
      'DeviceMotionEvent',
      makeIosDeviceMotionEvent(() => Promise.resolve('denied')),
    );

    const result = await requestShakeToReportPermission();

    expect(result).toBe('denied');
    expect(getShakeReportPermission()).toBe('denied');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('denied');
  });

  it('treats Safari throwing (called outside a user gesture) as denied rather than hanging', async () => {
    vi.stubGlobal(
      'DeviceMotionEvent',
      makeIosDeviceMotionEvent(() =>
        Promise.reject(new Error('must be called from a user gesture')),
      ),
    );

    const result = await requestShakeToReportPermission();

    expect(result).toBe('denied');
    expect(getShakeReportPermission()).toBe('denied');
  });
});

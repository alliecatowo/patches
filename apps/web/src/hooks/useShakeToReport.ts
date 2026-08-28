import { useEffect, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Shake-to-report (B-114 web half): listens for DeviceMotion spikes and routes to
 * `/report`. Android/Chrome fire devicemotion without any prompt; iOS 13+ requires a
 * user-gesture permission grant (`DeviceMotionEvent.requestPermission()`), which the
 * Appearance settings entry performs (B-181) — until granted this hook stays inert
 * there rather than silently listening for events that will never fire. Desktop (no
 * accelerometer) never fires events either way.
 */
export function shakeMagnitudeForTest(g: {
  x?: number | null;
  y?: number | null;
  z?: number | null;
}): number {
  return Math.sqrt((g.x ?? 0) ** 2 + (g.y ?? 0) ** 2 + (g.z ?? 0) ** 2);
}

export type ShakeReportPermission = 'unknown' | 'granted' | 'denied';

const SHAKE_PERMISSION_STORAGE_KEY = 'patches.web.shake-report-permission.v1';
const SHAKE_PERMISSIONS: readonly ShakeReportPermission[] = ['unknown', 'granted', 'denied'];
type Listener = () => void;

function readShakePermission(): ShakeReportPermission {
  if (typeof window === 'undefined') return 'unknown';
  try {
    const value = window.localStorage.getItem(SHAKE_PERMISSION_STORAGE_KEY);
    return value !== null && SHAKE_PERMISSIONS.includes(value as ShakeReportPermission)
      ? (value as ShakeReportPermission)
      : 'unknown';
  } catch {
    // Permission memory is best-effort when storage is unavailable; re-prompt next visit.
    return 'unknown';
  }
}

function persistShakePermission(value: ShakeReportPermission): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SHAKE_PERMISSION_STORAGE_KEY, value);
  } catch {
    // The grant still applies for this session even if it can't be remembered.
  }
}

let shakePermission: ShakeReportPermission = readShakePermission();
const shakePermissionListeners = new Set<Listener>();

/**
 * Records the outcome of an actual `requestPermission()` call. Exported (not test-only)
 * because `requestShakeToReportPermission` below needs it too — same shape as the other
 * client-only preference stores in this codebase (e.g. `lib/interfacePreferences.ts`).
 */
export function setShakeReportPermission(value: ShakeReportPermission): void {
  shakePermission = value;
  persistShakePermission(value);
  for (const listener of shakePermissionListeners) listener();
}

export function getShakeReportPermission(): ShakeReportPermission {
  return shakePermission;
}

export function subscribeShakeReportPermission(listener: Listener): () => void {
  shakePermissionListeners.add(listener);
  return () => shakePermissionListeners.delete(listener);
}

function handleShakePermissionStorage(event: StorageEvent): void {
  if (event.storageArea !== null && event.storageArea !== window.localStorage) return;
  if (event.key !== SHAKE_PERMISSION_STORAGE_KEY) return;
  const next =
    event.newValue !== null && SHAKE_PERMISSIONS.includes(event.newValue as ShakeReportPermission)
      ? (event.newValue as ShakeReportPermission)
      : 'unknown';
  shakePermission = next;
  for (const listener of shakePermissionListeners) listener();
}

if (typeof window !== 'undefined') window.addEventListener('storage', handleShakePermissionStorage);

/** The current shake-to-report permission grant, reactive across tabs and settings changes. */
export function useShakeReportPermission(): ShakeReportPermission {
  return useSyncExternalStore(
    subscribeShakeReportPermission,
    getShakeReportPermission,
    () => 'unknown' as const,
  );
}

/**
 * iOS 13+ Safari puts `requestPermission` directly on the `DeviceMotionEvent`
 * constructor — a non-standard Apple extension the DOM lib ships no ambient type for.
 * This interface exists only to name that one static method without reaching for `any`.
 */
interface IosMotionPermissionConstructor {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

function getIosMotionPermissionRequester(): (() => Promise<'granted' | 'denied'>) | null {
  if (typeof DeviceMotionEvent === 'undefined') return null;
  const ctor = DeviceMotionEvent as unknown as IosMotionPermissionConstructor;
  return typeof ctor.requestPermission === 'function' ? ctor.requestPermission : null;
}

/** True on iOS 13+ Safari/PWA, where shake-to-report needs an explicit gesture opt-in first. */
export function shakeToReportRequiresGesturePermission(): boolean {
  return getIosMotionPermissionRequester() !== null;
}

/**
 * Requests the iOS motion permission. MUST be called synchronously from inside a real
 * user-gesture event handler (a button `onClick`, not a `useEffect`) — Safari silently
 * rejects the call otherwise, which is the exact silent-no-op failure mode this hook
 * used to have. No-ops (resolving `'unknown'`) on browsers without the gate.
 */
export async function requestShakeToReportPermission(): Promise<ShakeReportPermission> {
  const requestPermission = getIosMotionPermissionRequester();
  if (requestPermission === null) return 'unknown';
  try {
    const outcome = await requestPermission();
    const result: ShakeReportPermission = outcome === 'granted' ? 'granted' : 'denied';
    setShakeReportPermission(result);
    return result;
  } catch {
    // Safari throws if requestPermission() wasn't triggered by a user gesture; surface
    // that as "denied" so the UI gives an honest "not enabled" message instead of hanging.
    setShakeReportPermission('denied');
    return 'denied';
  }
}

export function useShakeToReport(enabled = true, threshold = 18): void {
  const navigate = useNavigate();
  const permission = useShakeReportPermission();
  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !('DeviceMotionEvent' in window)) return;
    // On iOS 13+ Safari, devicemotion never fires without a granted gesture permission —
    // attaching the listener anyway would be the silent no-op this hook used to be.
    if (shakeToReportRequiresGesturePermission() && permission !== 'granted') return;
    let lastFire = 0;
    let peaks = 0;
    let windowStart = 0;
    function onMotion(event: DeviceMotionEvent): void {
      const g = event.accelerationIncludingGravity;
      if (g === null) return;
      const magnitude = shakeMagnitudeForTest(g);
      const now = Date.now();
      if (now - windowStart > 800) {
        peaks = 0;
        windowStart = now;
      }
      if (magnitude > threshold + 9.81) {
        peaks += 1;
        if (peaks >= 3 && now - lastFire > 4000) {
          lastFire = now;
          peaks = 0;
          // iOS Safari shows its own "Undo Typing" system prompt over whatever is
          // focused when navigation happens mid-edit (#299) — blur first so the sheet
          // that follows isn't fighting a native dialog for the screen.
          if (
            document.activeElement instanceof HTMLElement &&
            document.activeElement !== document.body
          ) {
            document.activeElement.blur();
          }
          void navigate('/report');
        }
      }
    }
    window.addEventListener('devicemotion', onMotion);
    return () => window.removeEventListener('devicemotion', onMotion);
  }, [enabled, navigate, threshold, permission]);
}

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Shake-to-report (B-114 web half): listens for DeviceMotion spikes and routes to
 * `/report`. Android/Chrome fire devicemotion without any prompt; iOS 13+ requires a
 * user-gesture permission grant, which the Settings entry performs — until granted this
 * hook is a silent no-op there. Desktop (no accelerometer) never fires events.
 */
export function shakeMagnitudeForTest(g: {
  x?: number | null;
  y?: number | null;
  z?: number | null;
}): number {
  return Math.sqrt((g.x ?? 0) ** 2 + (g.y ?? 0) ** 2 + (g.z ?? 0) ** 2);
}

export function useShakeToReport(enabled = true, threshold = 18): void {
  const navigate = useNavigate();
  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !('DeviceMotionEvent' in window)) return;
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
          void navigate('/report');
        }
      }
    }
    window.addEventListener('devicemotion', onMotion);
    return () => window.removeEventListener('devicemotion', onMotion);
  }, [enabled, navigate, threshold]);
}

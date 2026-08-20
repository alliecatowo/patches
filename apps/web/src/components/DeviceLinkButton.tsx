import { describeError } from '@patches/client';
import { DeviceLinkStatus } from '@patches/proto/es';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { api, establishSession } from '../api/client.js';
import styles from '../routes/AuthForm.module.css';

interface DeviceLink {
  deviceCode: string;
  userCode: string;
  intervalSeconds: number;
}

/**
 * "Approve this login from your terminal" (P15-005) — the device-link half of the flow
 * documented on `AuthService.BeginDeviceLink`/`PollDeviceLink`/`ApproveDeviceLink` in
 * `auth.proto`. There is no central SSO or third party here: this browser and a terminal the
 * viewer is already signed in from are the *same account holder's* own two devices, and the
 * node is only mediating between them.
 *
 * Same device-flow shape as `GitHubLoginButton` (poll on a `setTimeout` loop, back off +5s on
 * `SLOW_DOWN`, never `setInterval`), with two differences: there is no `verification_uri` to
 * open — the account holder runs `patches approve <user_code>` from their own terminal instead
 * of visiting a link — and there is no `DENIED` status, since nothing on the server actively
 * rejects a link; it only ever completes or expires unused.
 */
export function DeviceLinkButton(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const [link, setLink] = useState<DeviceLink | null>(null);
  const [expired, setExpired] = useState(false);
  const cancelledRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearScheduledPoll = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      cancelledRef.current = true;
      clearScheduledPoll();
    },
    [clearScheduledPoll],
  );

  const beginMutation = useMutation({
    mutationFn: () => api.auth.beginDeviceLink({}),
    onSuccess: (response) => {
      setExpired(false);
      const deviceLink: DeviceLink = {
        deviceCode: response.deviceCode,
        userCode: response.userCode,
        intervalSeconds: response.interval,
      };
      setLink(deviceLink);
      schedulePoll(deviceLink, deviceLink.intervalSeconds);
    },
  });

  function schedulePoll(deviceLink: DeviceLink, delaySeconds: number): void {
    clearScheduledPoll();
    timeoutRef.current = setTimeout(() => {
      void pollOnce(deviceLink);
    }, delaySeconds * 1000);
  }

  async function pollOnce(deviceLink: DeviceLink): Promise<void> {
    if (cancelledRef.current) return;
    try {
      const result = await api.auth.pollDeviceLink({ deviceCode: deviceLink.deviceCode });
      if (cancelledRef.current) return;
      switch (result.status) {
        case DeviceLinkStatus.PENDING:
          schedulePoll(deviceLink, deviceLink.intervalSeconds);
          return;
        case DeviceLinkStatus.SLOW_DOWN: {
          const backedOff: DeviceLink = {
            ...deviceLink,
            intervalSeconds: deviceLink.intervalSeconds + 5,
          };
          setLink(backedOff);
          schedulePoll(backedOff, backedOff.intervalSeconds);
          return;
        }
        case DeviceLinkStatus.EXPIRED:
          setExpired(true);
          setLink(null);
          return;
        case DeviceLinkStatus.COMPLETE:
        case DeviceLinkStatus.UNSPECIFIED:
        default:
          if (result.session) {
            await establishSession(result.session);
            const from = (location.state as { from?: string } | null)?.from ?? '/';
            void navigate(from, { replace: true });
          }
          return;
      }
    } catch {
      if (cancelledRef.current) return;
      // A transient poll failure (network blip) shouldn't kill the flow — keep polling at
      // the same interval until the device code itself expires.
      schedulePoll(deviceLink, deviceLink.intervalSeconds);
    }
  }

  const onCancel = (): void => {
    // Same per-device-code (not permanent) cancellation as `GitHubLoginButton.onCancel`.
    cancelledRef.current = true;
    clearScheduledPoll();
    cancelledRef.current = false;
    setLink(null);
    setExpired(false);
    beginMutation.reset();
  };

  if (link) {
    return (
      <div>
        <p>In a terminal where you&rsquo;re already signed in, run:</p>
        <p>
          <code>patches approve {link.userCode}</code>
        </p>
        <button type="button" className={styles['linkButton']} onClick={onCancel}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div>
      {expired ? (
        <p className={styles['error']}>That code expired before it was approved. Try again.</p>
      ) : null}
      {beginMutation.isError ? (
        <p className={styles['error']}>
          {describeError(beginMutation.error, { context: 'credentials' }).message}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => beginMutation.mutate()}
        disabled={beginMutation.isPending}
      >
        {beginMutation.isPending ? 'Starting…' : 'Approve from your terminal'}
      </button>
    </div>
  );
}

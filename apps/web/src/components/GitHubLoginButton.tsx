import { describeError } from '@patches/client';
import { GitHubLoginStatus } from '@patches/proto/es';
import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { api, establishSession } from '../api/client.js';
import { useAbortableMutation } from '../hooks/useAbortableMutation.js';
import styles from '../routes/AuthForm.module.css';

interface DeviceLink {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  intervalSeconds: number;
}

type TerminalReason = 'expired' | 'denied';

export interface GitHubLoginButtonProps {
  /**
   * `'login'` (default): an anonymous viewer signs in with an already-linked GitHub
   * credential and is navigated away on success. `'link'`: a signed-in caller links
   * GitHub to their own account (spec §167 — the same `BeginGitHubLogin`/`PollGitHubLogin`
   * RPC pair serves both; the server tells the two apart by whether the request carries a
   * bearer token at all, see `AuthController.optionalCallerUserId`). In `'link'` mode this
   * never navigates — it re-establishes the (rotated) session in place and calls `onLinked`
   * so the caller can refresh its own credential list.
   */
  mode?: 'login' | 'link';
  onLinked?: () => void;
}

/**
 * "Sign in with GitHub" (P15-005, ADR 0011) — GitHub is a *credential*, never an identity
 * provider here: this only proves control of a GitHub account to authenticate an existing
 * or new Patches identity, it never imports a GitHub profile as the account's identity.
 *
 * Device flow: `BeginGitHubLogin` returns a user code + verification URL the viewer opens
 * in another tab/device, then this polls `PollGitHubLogin` on a `setTimeout` loop (never
 * `setInterval` — a slow poll RPC must not overlap the next one) until GitHub reports a
 * terminal status. `SLOW_DOWN` backs the interval off by +5s, matching GitHub's own device
 * flow convention.
 *
 * Visibility is gated by the caller (`LoginRoute`/`CredentialsRoute`) on
 * `GetAuthPolicyResponse.github_auth` (P15-006) — this component itself renders
 * unconditionally.
 */
export function GitHubLoginButton({
  mode = 'login',
  onLinked,
}: GitHubLoginButtonProps): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const [link, setLink] = useState<DeviceLink | null>(null);
  const [terminal, setTerminal] = useState<TerminalReason | null>(null);
  const [copied, setCopied] = useState(false);
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

  // B-164: navigating away right after clicking "Sign in with GitHub" but before this
  // resolves must not schedule an orphaned poll loop that later calls `establishSession`
  // and `navigate` for a screen that's gone (`cancelledRef` above only guards the poll
  // loop's own steps, not this initial call).
  const beginMutation = useAbortableMutation({
    mutationFn: (_variables: void, signal) => api.auth.beginGitHubLogin({}, { signal }),
    onSuccess: (response) => {
      setTerminal(null);
      setCopied(false);
      const deviceLink: DeviceLink = {
        deviceCode: response.deviceCode,
        userCode: response.userCode,
        verificationUri: response.verificationUri,
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
      const result = await api.auth.pollGitHubLogin({ deviceCode: deviceLink.deviceCode });
      if (cancelledRef.current) return;
      switch (result.status) {
        case GitHubLoginStatus.PENDING:
          schedulePoll(deviceLink, deviceLink.intervalSeconds);
          return;
        case GitHubLoginStatus.SLOW_DOWN: {
          const backedOff: DeviceLink = {
            ...deviceLink,
            intervalSeconds: deviceLink.intervalSeconds + 5,
          };
          setLink(backedOff);
          schedulePoll(backedOff, backedOff.intervalSeconds);
          return;
        }
        case GitHubLoginStatus.EXPIRED:
          setTerminal('expired');
          setLink(null);
          return;
        case GitHubLoginStatus.DENIED:
          setTerminal('denied');
          setLink(null);
          return;
        case GitHubLoginStatus.COMPLETE:
        case GitHubLoginStatus.UNSPECIFIED:
        default:
          if (result.session) {
            await establishSession(result.session);
            if (mode === 'link') {
              setLink(null);
              onLinked?.();
            } else {
              const from = (location.state as { from?: string } | null)?.from ?? '/';
              void navigate(from, { replace: true });
            }
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
    // Stop any in-flight poll from scheduling another round (an already-sent fetch may
    // still resolve after this), then clear the flag back so a later "Sign in with
    // GitHub" click can poll again — cancellation is per device-code, not permanent.
    cancelledRef.current = true;
    clearScheduledPoll();
    cancelledRef.current = false;
    setLink(null);
    setTerminal(null);
    beginMutation.reset();
  };

  const onCopy = (): void => {
    if (!link) return;
    // Clipboard permission is non-essential here — the code stays visible on the page
    // either way, so a denied/unsupported clipboard API is silently ignored.
    navigator.clipboard.writeText(link.userCode).then(
      () => setCopied(true),
      () => {
        /* clipboard write is a convenience only; the code is already shown on screen */
      },
    );
  };

  if (link) {
    return (
      <div>
        <p>
          Go to{' '}
          <a href={link.verificationUri} target="_blank" rel="noreferrer">
            {link.verificationUri}
          </a>{' '}
          and enter this code:
        </p>
        <p>
          <strong>{link.userCode}</strong>{' '}
          <button type="button" className={styles['linkButton']} onClick={onCopy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </p>
        <button type="button" className={styles['linkButton']} onClick={onCancel}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div>
      {terminal === 'expired' ? (
        <p className={styles['error']}>That code expired before it was used. Try again.</p>
      ) : null}
      {terminal === 'denied' ? (
        <p className={styles['error']}>Sign-in was denied on GitHub. Try again.</p>
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
        {beginMutation.isPending
          ? 'Starting…'
          : mode === 'link'
            ? 'Link a GitHub account'
            : 'Sign in with GitHub'}
      </button>
    </div>
  );
}

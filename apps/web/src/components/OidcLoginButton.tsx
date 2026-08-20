import { describeError } from '@patches/client';
import { OidcLoginStatus, type OidcProviderInfo } from '@patches/proto/es';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { api, establishSession } from '../api/client.js';
import styles from '../routes/AuthForm.module.css';

interface DeviceLink {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  intervalSeconds: number;
}

type TerminalReason = 'expired' | 'denied';

export interface OidcLoginButtonProps {
  provider: OidcProviderInfo;
  /** Same `'login'`/`'link'` distinction as `GitHubLoginButtonProps.mode` — see there for
   * the full explanation of how the server tells the two apart. */
  mode?: 'login' | 'link';
  onLinked?: () => void;
}

/**
 * "Sign in with <provider>" (P15-006) — one instance per entry of
 * `GetAuthPolicyResponse.oidc_providers`, parameterized by `provider.id`. Same "credential,
 * never an identity" contract and device-flow shape as `GitHubLoginButton` (poll on a
 * `setTimeout` loop, back off +5s on `SLOW_DOWN`, never `setInterval`) — the only difference
 * is which RPC pair it calls and that `provider` is threaded through every request.
 */
export function OidcLoginButton({
  provider,
  mode = 'login',
  onLinked,
}: OidcLoginButtonProps): JSX.Element {
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

  const beginMutation = useMutation({
    mutationFn: () => api.auth.beginOidcLogin({ provider: provider.id }),
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
      const result = await api.auth.pollOidcLogin({
        provider: provider.id,
        deviceCode: deviceLink.deviceCode,
      });
      if (cancelledRef.current) return;
      switch (result.status) {
        case OidcLoginStatus.PENDING:
          schedulePoll(deviceLink, deviceLink.intervalSeconds);
          return;
        case OidcLoginStatus.SLOW_DOWN: {
          const backedOff: DeviceLink = {
            ...deviceLink,
            intervalSeconds: deviceLink.intervalSeconds + 5,
          };
          setLink(backedOff);
          schedulePoll(backedOff, backedOff.intervalSeconds);
          return;
        }
        case OidcLoginStatus.EXPIRED:
          setTerminal('expired');
          setLink(null);
          return;
        case OidcLoginStatus.DENIED:
          setTerminal('denied');
          setLink(null);
          return;
        case OidcLoginStatus.COMPLETE:
        case OidcLoginStatus.UNSPECIFIED:
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
        <p className={styles['error']}>Sign-in was denied. Try again.</p>
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
            ? `Link ${provider.displayName}`
            : `Sign in with ${provider.displayName}`}
      </button>
    </div>
  );
}

import {
  DeviceLinkStatus,
  GitHubLoginStatus,
  OidcLoginStatus,
  type PollDeviceLinkResponse,
  type PollGitHubLoginResponse,
  type PollOidcLoginResponse,
  type Session,
} from '@patches/proto/es';

/**
 * Shared device-flow polling state machine for GitHub login, generic OIDC login, and the
 * SSH-via-approve device-link flow (`apps/mobile/src/screens/DeviceFlowButton.tsx`). Mirrors
 * `apps/web/src/components/GitHubLoginButton.tsx`/`DeviceLinkButton.tsx`'s discipline
 * (`setTimeout`, never `setInterval`, so a slow poll RPC can't overlap itself; `SLOW_DOWN`
 * backs the interval off by +5s) but factored out so the state-transition logic is
 * Vitest-covered without an RN render, per this app's "logic in .ts, screens thin" convention
 * (`docs/research/expo-react-native.md` §4).
 */
export type DevicePollOutcome<TSession> =
  | { kind: 'pending'; nextIntervalSeconds: number }
  | { kind: 'terminal'; reason: 'expired' | 'denied' }
  | { kind: 'complete'; session: TSession };

export interface DeviceLink {
  deviceCode: string;
  userCode: string;
  verificationUri?: string;
  intervalSeconds: number;
}

export interface StartDevicePollOptions<TResponse, TSessionT> {
  link: DeviceLink;
  poll: (deviceCode: string) => Promise<TResponse>;
  classify: (response: TResponse) => DevicePollOutcome<TSessionT>;
  /** Called every time the interval changes (first schedule, and again on SLOW_DOWN). */
  onIntervalChange: (link: DeviceLink) => void;
  onTerminal: (reason: 'expired' | 'denied') => void;
  onComplete: (session: TSessionT) => void;
  /** Overridable only for tests — production callers never pass these. */
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

export interface DevicePollHandle {
  /** Stops scheduling further polls. A poll already in flight may still resolve, but its
   * result is discarded. */
  cancel: () => void;
}

/** Starts the poll loop and returns a handle to cancel it (component unmount, explicit
 * "Cancel" button). */
export function startDevicePoll<TResponse, TSessionT>(
  options: StartDevicePollOptions<TResponse, TSessionT>,
): DevicePollHandle {
  const scheduleTimeout = options.setTimeoutFn ?? setTimeout;
  const cancelTimeout = options.clearTimeoutFn ?? clearTimeout;
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function schedule(link: DeviceLink): void {
    if (timer !== null) cancelTimeout(timer);
    timer = scheduleTimeout(() => {
      void pollOnce(link);
    }, link.intervalSeconds * 1000);
  }

  async function pollOnce(link: DeviceLink): Promise<void> {
    if (cancelled) return;
    let response: TResponse;
    try {
      response = await options.poll(link.deviceCode);
    } catch {
      // A transient poll failure (network blip) shouldn't kill the flow — keep polling at
      // the same interval until the device code itself expires server-side.
      if (!cancelled) schedule(link);
      return;
    }
    if (cancelled) return;
    const outcome = options.classify(response);
    switch (outcome.kind) {
      case 'pending': {
        const next: DeviceLink = { ...link, intervalSeconds: outcome.nextIntervalSeconds };
        options.onIntervalChange(next);
        schedule(next);
        return;
      }
      case 'terminal':
        options.onTerminal(outcome.reason);
        return;
      case 'complete':
        options.onComplete(outcome.session);
        return;
    }
  }

  schedule(options.link);

  return {
    cancel: () => {
      cancelled = true;
      if (timer !== null) cancelTimeout(timer);
      timer = null;
    },
  };
}

/** `PENDING`/`SLOW_DOWN` share the same "keep polling" handling everywhere; only which
 * statuses count as terminal (and whether `DENIED` exists) differs per RPC pair below. */
function withBackoff(currentIntervalSeconds: number): number {
  return currentIntervalSeconds + 5;
}

export function classifyGitHubLogin(
  response: PollGitHubLoginResponse,
  currentIntervalSeconds: number,
): DevicePollOutcome<Session> {
  switch (response.status) {
    case GitHubLoginStatus.PENDING:
      return { kind: 'pending', nextIntervalSeconds: currentIntervalSeconds };
    case GitHubLoginStatus.SLOW_DOWN:
      return { kind: 'pending', nextIntervalSeconds: withBackoff(currentIntervalSeconds) };
    case GitHubLoginStatus.EXPIRED:
      return { kind: 'terminal', reason: 'expired' };
    case GitHubLoginStatus.DENIED:
      return { kind: 'terminal', reason: 'denied' };
    case GitHubLoginStatus.COMPLETE:
    case GitHubLoginStatus.UNSPECIFIED:
    default:
      if (response.session) return { kind: 'complete', session: response.session };
      // COMPLETE with no session should never happen server-side; treat like a still-pending
      // poll rather than crash the UI.
      return { kind: 'pending', nextIntervalSeconds: currentIntervalSeconds };
  }
}

export function classifyOidcLogin(
  response: PollOidcLoginResponse,
  currentIntervalSeconds: number,
): DevicePollOutcome<Session> {
  switch (response.status) {
    case OidcLoginStatus.PENDING:
      return { kind: 'pending', nextIntervalSeconds: currentIntervalSeconds };
    case OidcLoginStatus.SLOW_DOWN:
      return { kind: 'pending', nextIntervalSeconds: withBackoff(currentIntervalSeconds) };
    case OidcLoginStatus.EXPIRED:
      return { kind: 'terminal', reason: 'expired' };
    case OidcLoginStatus.DENIED:
      return { kind: 'terminal', reason: 'denied' };
    case OidcLoginStatus.COMPLETE:
    case OidcLoginStatus.UNSPECIFIED:
    default:
      if (response.session) return { kind: 'complete', session: response.session };
      return { kind: 'pending', nextIntervalSeconds: currentIntervalSeconds };
  }
}

/** `DeviceLinkStatus` has no `DENIED` (spec: "there is no `DENIED` status, since nothing on
 * the server actively rejects a link; it only ever completes or expires unused"). */
export function classifyDeviceLink(
  response: PollDeviceLinkResponse,
  currentIntervalSeconds: number,
): DevicePollOutcome<Session> {
  switch (response.status) {
    case DeviceLinkStatus.PENDING:
      return { kind: 'pending', nextIntervalSeconds: currentIntervalSeconds };
    case DeviceLinkStatus.SLOW_DOWN:
      return { kind: 'pending', nextIntervalSeconds: withBackoff(currentIntervalSeconds) };
    case DeviceLinkStatus.EXPIRED:
      return { kind: 'terminal', reason: 'expired' };
    case DeviceLinkStatus.COMPLETE:
    case DeviceLinkStatus.UNSPECIFIED:
    default:
      if (response.session) return { kind: 'complete', session: response.session };
      return { kind: 'pending', nextIntervalSeconds: currentIntervalSeconds };
  }
}

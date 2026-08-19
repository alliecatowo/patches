import { useQuery } from '@tanstack/react-query';
import type { JSX } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../api/client.js';
import { useSession } from '../hooks/useSession.js';

/**
 * A-053 (spec §197.1: "when a node publishes a **material** change it increments the
 * version, and every client MUST show the new summary at next session start"). A
 * best-effort, non-blocking nudge toward `/settings/privacy` when this actor's
 * last-acknowledged `privacy_notice_version` (`GetPrivacyPrefs`) is behind the node's
 * current one (`GetNodePolicy`) — it never blocks anything, since acknowledgement is a
 * record that the text was shown, not a gate on any function (spec §197.1). Renders
 * nothing while signed out, loading, or on a fetch failure; the settings page itself
 * (`PrivacySettingsRoute`) is the actual acknowledge flow, this is only a hint. Shares its
 * `useQuery` keys with `PrivacySettingsRoute` on purpose, so a click straight into
 * `/settings/privacy` reuses the same cached data instead of refetching.
 */
export function PrivacyNoticeBanner(): JSX.Element | null {
  const session = useSession();
  const policyQuery = useQuery({
    queryKey: ['node-policy'],
    queryFn: () => api.node.getNodePolicy({}),
    enabled: session !== null,
    staleTime: 60_000,
  });
  const prefsQuery = useQuery({
    queryKey: ['privacy-prefs'],
    queryFn: () => api.privacy.getPrivacyPrefs({}),
    enabled: session !== null,
  });

  const currentVersion = policyQuery.data?.policy?.privacyNoticeVersion;
  const acknowledgedVersion = prefsQuery.data?.prefs?.privacyNoticeVersion;
  const stale =
    session !== null &&
    currentVersion !== undefined &&
    acknowledgedVersion !== undefined &&
    acknowledgedVersion < currentVersion;

  if (!stale) return null;

  return (
    <p
      role="status"
      style={{
        margin: 0,
        padding: '0.5rem 1rem',
        background: 'var(--bg-raised)',
        borderBottom: '1px solid var(--border)',
        fontSize: '0.9rem',
      }}
    >
      This node&apos;s privacy notice changed — <Link to="/settings/privacy">review it</Link>.
    </p>
  );
}

import { AccountExportStatus } from '@patches/proto/es';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JSX } from 'react';

import { api } from '../../api/client.js';
import { humanizeEnumValue } from '../../lib/enumLabels.js';
import { formatAbsoluteTime } from '../../lib/format.js';
import styles from '../AuthForm.module.css';

/**
 * `/settings/privacy` (P14-018, spec §196–§197, §203–§204) — the node's published
 * privacy notice + acknowledgement, discoverability/locked prefs, account export, and
 * account deletion with its grace period. Every mutation here is reversible or plainly
 * explained before it's fired; none of it gates function (Amendment B §184.3).
 */
export function PrivacySettingsRoute(): JSX.Element {
  const queryClient = useQueryClient();

  const policyQuery = useQuery({
    queryKey: ['node-policy'],
    queryFn: () => api.node.getNodePolicy({}),
    staleTime: 60_000,
  });
  const prefsQuery = useQuery({
    queryKey: ['privacy-prefs'],
    queryFn: () => api.privacy.getPrivacyPrefs({}),
  });
  const exportQuery = useQuery({
    queryKey: ['account-export'],
    queryFn: () => api.privacy.getExportStatus({}),
  });
  const deletionQuery = useQuery({
    queryKey: ['account-deletion'],
    queryFn: () => api.privacy.getDeletionStatus({}),
  });

  const policy = policyQuery.data?.policy;
  const prefs = prefsQuery.data?.prefs;

  const acknowledgeMutation = useMutation({
    mutationFn: () =>
      api.privacy.acknowledgePrivacyNotice({ noticeVersion: policy?.privacyNoticeVersion ?? 0 }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['privacy-prefs'] }),
  });

  const prefsMutation = useMutation({
    mutationFn: (next: {
      discoverable: boolean;
      indexable: boolean;
      showInLocalFeed: boolean;
      locked: boolean;
    }) =>
      api.privacy.updatePrivacyPrefs({
        ...next,
        updateMask: {
          paths: ['discoverable', 'indexable', 'show_in_local_feed', 'locked'],
        },
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['privacy-prefs'] }),
  });

  const exportMutation = useMutation({
    mutationFn: () => api.privacy.exportAccount({}),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['account-export'] }),
  });

  const requestDeletionMutation = useMutation({
    mutationFn: () => api.privacy.requestAccountDeletion({}),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['account-deletion'] }),
  });
  const cancelDeletionMutation = useMutation({
    mutationFn: () => api.privacy.cancelAccountDeletion({}),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['account-deletion'] }),
  });

  const togglePref = (key: 'discoverable' | 'indexable' | 'showInLocalFeed' | 'locked'): void => {
    if (prefs === undefined) return;
    prefsMutation.mutate({
      discoverable: prefs.discoverable,
      indexable: prefs.indexable,
      showInLocalFeed: prefs.showInLocalFeed,
      locked: prefs.locked,
      [key]: !prefs[key],
    });
  };

  const exportRecord = exportQuery.data?.export;
  const deletion = deletionQuery.data?.deletion;

  return (
    <div className={styles['wrap']} style={{ margin: 0, maxWidth: 'none' }}>
      <h1>Privacy</h1>

      <section>
        <h2>This node&apos;s privacy notice</h2>
        {policyQuery.isPending ? <p>Loading…</p> : null}
        {policy ? (
          <>
            <p>
              {policy.privacyNoticeSummary === ''
                ? 'This node has not published a privacy notice.'
                : policy.privacyNoticeSummary}
            </p>
            {policy.privacyNoticeUrl !== '' ? (
              <p>
                <a href={policy.privacyNoticeUrl} target="_blank" rel="noopener noreferrer">
                  Full notice (v{policy.privacyNoticeVersion})
                </a>
              </p>
            ) : null}
            <p style={{ color: 'var(--fg-muted)' }}>
              Direct messages are <strong>end-to-end encrypted</strong>. This node cannot read them,
              but it can see who you message and when.
            </p>
            {prefs !== undefined && prefs.privacyNoticeVersion < policy.privacyNoticeVersion ? (
              <button
                type="button"
                className={styles['submit']}
                style={{ width: 'auto' }}
                onClick={() => acknowledgeMutation.mutate()}
                disabled={acknowledgeMutation.isPending}
              >
                Acknowledge notice v{policy.privacyNoticeVersion}
              </button>
            ) : (
              <p style={{ color: 'var(--fg-muted)' }}>Acknowledged.</p>
            )}
          </>
        ) : null}
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2>Visibility</h2>
        {prefsQuery.isPending ? <p>Loading…</p> : null}
        {prefs ? (
          <>
            <label className={styles['field']} style={{ flexDirection: 'row', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={prefs.discoverable}
                onChange={() => togglePref('discoverable')}
              />
              Discoverable in people search / directory
            </label>
            <label className={styles['field']} style={{ flexDirection: 'row', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={prefs.indexable}
                onChange={() => togglePref('indexable')}
              />
              Indexable in post search
            </label>
            <label className={styles['field']} style={{ flexDirection: 'row', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={prefs.showInLocalFeed}
                onChange={() => togglePref('showInLocalFeed')}
              />
              Show my public posts on this node&apos;s local timeline
            </label>
            <label className={styles['field']} style={{ flexDirection: 'row', gap: '0.5rem' }}>
              <input type="checkbox" checked={prefs.locked} onChange={() => togglePref('locked')} />
              Locked account — new followers need my approval
            </label>
          </>
        ) : null}
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2>Export your account</h2>
        <p style={{ color: 'var(--fg-muted)' }}>
          Runs as a background job — never generated synchronously in this request.
        </p>
        {exportRecord && exportRecord.status !== AccountExportStatus.UNSPECIFIED ? (
          <p>
            Status: {humanizeEnumValue(exportRecord.status, AccountExportStatus)}
            {exportRecord.status === AccountExportStatus.READY && exportRecord.downloadUrl ? (
              <>
                {' — '}
                <a href={exportRecord.downloadUrl}>Download</a>
                {exportRecord.expiresAt
                  ? ` (expires ${formatAbsoluteTime(exportRecord.expiresAt)})`
                  : ''}
              </>
            ) : null}
          </p>
        ) : null}
        <button
          type="button"
          className={styles['submit']}
          style={{ width: 'auto' }}
          onClick={() => exportMutation.mutate()}
          disabled={exportMutation.isPending}
        >
          {exportMutation.isPending ? 'Requesting…' : 'Request export'}
        </button>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2>Delete your account</h2>
        {deletion?.pending ? (
          <>
            <p style={{ color: 'var(--danger)' }}>
              Deletion pending
              {deletion.purgeAfter
                ? ` — purges after ${formatAbsoluteTime(deletion.purgeAfter)}`
                : ''}
              . Your account is hidden from feeds, search, and the local timeline in the meantime.
            </p>
            <button
              type="button"
              className={styles['submit']}
              style={{ width: 'auto' }}
              onClick={() => cancelDeletionMutation.mutate()}
              disabled={cancelDeletionMutation.isPending}
            >
              Cancel deletion
            </button>
          </>
        ) : (
          <>
            <p style={{ color: 'var(--fg-muted)' }}>
              Your account disappears from feeds, search, and the local timeline immediately; this
              node keeps a grace period
              {policy?.accountDeletionGracePeriodDays
                ? ` of ${policy.accountDeletionGracePeriodDays} days`
                : ''}{' '}
              before permanent deletion, during which you can cancel.
            </p>
            <button
              type="button"
              className={styles['submit']}
              style={{ width: 'auto', background: 'var(--danger)' }}
              onClick={() => {
                if (window.confirm('Request account deletion? This starts the grace period now.')) {
                  requestDeletionMutation.mutate();
                }
              }}
              disabled={requestDeletionMutation.isPending}
            >
              Request account deletion
            </button>
          </>
        )}
      </section>
    </div>
  );
}

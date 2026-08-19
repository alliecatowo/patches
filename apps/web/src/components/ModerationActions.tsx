import { ReportReason, type Relationship } from '@patches/proto/es';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type JSX } from 'react';

import { api } from '../api/client.js';
import { useErrorToast } from '../hooks/useErrorToast.js';
import { useSession } from '../hooks/useSession.js';

const REPORT_REASONS: ReadonlyArray<{ value: ReportReason; label: string }> = [
  { value: ReportReason.SPAM, label: 'Spam' },
  { value: ReportReason.HARASSMENT, label: 'Harassment' },
  { value: ReportReason.HATE_SPEECH, label: 'Hate speech' },
  { value: ReportReason.ILLEGAL_CONTENT, label: 'Illegal content' },
  { value: ReportReason.IMPERSONATION, label: 'Impersonation' },
  { value: ReportReason.OTHER, label: 'Other' },
];

/**
 * Block/mute/report controls for a profile (`ModerationService`, spec §55, §61–64).
 * Shares the `['relationship', actorId]` query with `FollowButton` — a block also clears
 * any follow in either direction server-side (spec §62), so writing the response back into
 * that same cache entry keeps both components in sync without a refetch.
 */
export function ModerationActions({ actorId }: { actorId: string }): JSX.Element | null {
  const session = useSession();
  const onError = useErrorToast();
  const queryClient = useQueryClient();
  const isSelf = session?.actor.id === actorId;
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason>(ReportReason.SPAM);
  const [reportSent, setReportSent] = useState(false);

  const relationshipQuery = useQuery({
    queryKey: ['relationship', actorId],
    queryFn: () => api.socialGraph.getRelationship({ actorId }),
    enabled: session !== null && !isSelf,
  });

  const writeRelationship = (relationship: Relationship | undefined): void => {
    queryClient.setQueryData(['relationship', actorId], { relationship });
  };

  const blockMutation = useMutation({
    mutationFn: async (block: boolean): Promise<{ relationship?: Relationship | undefined }> =>
      block
        ? await api.moderation.blockActor({ actorId })
        : await api.moderation.unblockActor({ actorId }),
    onSuccess: (response) => writeRelationship(response.relationship),
    onError,
  });

  const muteMutation = useMutation({
    mutationFn: async (mute: boolean): Promise<{ relationship?: Relationship | undefined }> =>
      mute
        ? await api.moderation.muteActor({ actorId })
        : await api.moderation.unmuteActor({ actorId }),
    onSuccess: (response) => writeRelationship(response.relationship),
    onError,
  });

  const reportMutation = useMutation({
    mutationFn: () => api.moderation.reportActor({ actorId, reason: reportReason, details: '' }),
    onSuccess: () => {
      setReportSent(true);
      setReportOpen(false);
    },
    onError,
  });

  if (session === null || isSelf) return null;

  const relationship = relationshipQuery.data?.relationship;
  const blocked = relationship?.blocking ?? false;
  const muted = relationship?.muting ?? false;

  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <button
        type="button"
        onClick={() => blockMutation.mutate(!blocked)}
        disabled={blockMutation.isPending}
      >
        {blocked ? 'Unblock' : 'Block'}
      </button>
      <button
        type="button"
        onClick={() => muteMutation.mutate(!muted)}
        disabled={muteMutation.isPending}
      >
        {muted ? 'Unmute' : 'Mute'}
      </button>
      {reportOpen ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            reportMutation.mutate();
          }}
          style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
        >
          <select
            aria-label="Report reason"
            value={reportReason}
            onChange={(event) => setReportReason(Number(event.target.value))}
          >
            {REPORT_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <button type="submit" disabled={reportMutation.isPending}>
            Submit report
          </button>
          <button type="button" onClick={() => setReportOpen(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setReportOpen(true)}>
          Report
        </button>
      )}
      {reportSent ? <span>Report sent. Thanks.</span> : null}
    </div>
  );
}

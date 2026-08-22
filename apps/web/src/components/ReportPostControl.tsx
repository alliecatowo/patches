import { ReportReason } from '@patches/proto/es';
import { useMutation } from '@tanstack/react-query';
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

/** Self-service post reporting; node administrators resolve the resulting moderation report. */
export function ReportPostControl({
  postId,
  className,
}: {
  postId: string;
  className?: string | undefined;
}): JSX.Element | null {
  const session = useSession();
  const onError = useErrorToast();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [reason, setReason] = useState<ReportReason>(ReportReason.SPAM);
  const [details, setDetails] = useState('');

  const report = useMutation({
    mutationFn: () => api.moderation.reportPost({ postId, reason, details: details.trim() }),
    onSuccess: () => {
      setOpen(false);
      setSent(true);
    },
    onError,
  });

  if (session === null) return null;
  if (sent) return <span role="status">Report sent.</span>;
  if (!open) {
    return (
      <button type="button" className={className} onClick={() => setOpen(true)}>
        report
      </button>
    );
  }

  return (
    <form
      aria-label="Report post"
      onSubmit={(event) => {
        event.preventDefault();
        report.mutate();
      }}
      style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', width: '100%' }}
    >
      <select
        aria-label="Report reason"
        value={reason}
        onChange={(event) => setReason(Number(event.target.value))}
      >
        {REPORT_REASONS.map((entry) => (
          <option key={entry.value} value={entry.value}>
            {entry.label}
          </option>
        ))}
      </select>
      <input
        aria-label="Report details"
        value={details}
        maxLength={2_000}
        placeholder="Optional details"
        onChange={(event) => setDetails(event.target.value)}
      />
      <button type="submit" disabled={report.isPending}>
        Submit report
      </button>
      <button type="button" onClick={() => setOpen(false)} disabled={report.isPending}>
        Cancel
      </button>
    </form>
  );
}

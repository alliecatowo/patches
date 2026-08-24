import { GUESTBOOK_ENTRY_MAX_CHARS } from '@patches/domain';
import { ReportReason } from '@patches/proto/es';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type JSX } from 'react';

import { api } from '../api/client.js';
import { useErrorToast } from '../hooks/useErrorToast.js';
import { useSession } from '../hooks/useSession.js';
import styles from './GuestbookControls.module.css';

const REPORT_REASONS: ReadonlyArray<{ value: ReportReason; label: string }> = [
  { value: ReportReason.SPAM, label: 'Spam' },
  { value: ReportReason.HARASSMENT, label: 'Harassment' },
  { value: ReportReason.HATE_SPEECH, label: 'Hate speech' },
  { value: ReportReason.ILLEGAL_CONTENT, label: 'Illegal content' },
  { value: ReportReason.IMPERSONATION, label: 'Impersonation' },
  { value: ReportReason.OTHER, label: 'Other' },
];

/**
 * Web parity for the TUI's guestbook flows (B-080): signing is the same
 * `SignGuestbook` call `PageScreen` makes — authenticated only (no anonymous
 * signature, spec §172), body bounded by `@patches/domain`'s
 * `GUESTBOOK_ENTRY_MAX_CHARS`. Rate-limit (`ResourceExhausted`) and block errors
 * surface through `describeError`'s shared copy rather than a raw code.
 */
export function GuestbookSignForm({
  handle,
  slug,
}: {
  handle: string;
  slug: string;
}): JSX.Element | null {
  const session = useSession();
  const onError = useErrorToast();
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');

  const sign = useMutation({
    mutationFn: () => api.pages.signGuestbook({ handle, slug, body: body.trim() }),
    onSuccess: () => {
      setBody('');
      void queryClient.invalidateQueries({ queryKey: ['page', handle, slug, 'guestbook'] });
    },
    onError,
  });

  if (session === null) return null;

  return (
    <form
      aria-label="Sign the guestbook"
      className={styles['signForm']}
      onSubmit={(event) => {
        event.preventDefault();
        if (body.trim() !== '') sign.mutate();
      }}
    >
      <textarea
        aria-label="Guestbook entry"
        className={styles['signInput']}
        value={body}
        maxLength={GUESTBOOK_ENTRY_MAX_CHARS}
        placeholder="Leave a note on this page…"
        rows={2}
        onChange={(event) => setBody(event.target.value)}
      />
      <button
        type="submit"
        className={styles['signButton']}
        disabled={sign.isPending || body.trim() === ''}
      >
        Sign
      </button>
    </form>
  );
}

/** Per-entry owner/reporter affordances. Remove is shown to the page's owner only
 * (the server enforces it; idempotent per pages.proto). Reporting mirrors
 * `ReportPostControl` and is hidden on your own entries — there is nobody to
 * report yourself to. */
export function GuestbookEntryActions({
  entryId,
  authorActorId,
  ownerActorId,
}: {
  entryId: string;
  authorActorId: string | undefined;
  ownerActorId: string;
}): JSX.Element | null {
  const session = useSession();
  const onError = useErrorToast();
  const queryClient = useQueryClient();
  const [reporting, setReporting] = useState(false);
  const [sent, setSent] = useState(false);
  const [reason, setReason] = useState<ReportReason>(ReportReason.SPAM);
  const [details, setDetails] = useState('');

  const invalidateGuestbook = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['page'] });
  };

  const remove = useMutation({
    mutationFn: () => api.pages.removeGuestbookEntry({ entryId }),
    onSuccess: invalidateGuestbook,
    onError,
  });

  const report = useMutation({
    mutationFn: () => api.pages.reportGuestbookEntry({ entryId, reason, details: details.trim() }),
    onSuccess: () => {
      setReporting(false);
      setSent(true);
    },
    onError,
  });

  if (session === null) return null;
  const isOwner = session.actor.id === ownerActorId;
  const isOwnEntry = authorActorId !== undefined && authorActorId === session.actor.id;
  if (!isOwner && isOwnEntry) return null;

  if (sent) return <span role="status">Report sent.</span>;

  if (reporting) {
    return (
      <form
        aria-label="Report guestbook entry"
        className={styles['reportForm']}
        onSubmit={(event) => {
          event.preventDefault();
          report.mutate();
        }}
      >
        <select
          aria-label="Report reason"
          className={styles['reasonSelect']}
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
          className={styles['detailsInput']}
          type="text"
          value={details}
          maxLength={2_000}
          placeholder="Optional details"
          onChange={(event) => setDetails(event.target.value)}
        />
        <button type="submit" disabled={report.isPending}>
          Submit report
        </button>
        <button type="button" onClick={() => setReporting(false)} disabled={report.isPending}>
          Cancel
        </button>
      </form>
    );
  }

  return (
    <span className={styles['actions']}>
      {!isOwnEntry ? (
        <button type="button" className={styles['actionButton']} onClick={() => setReporting(true)}>
          report
        </button>
      ) : null}
      {isOwner ? (
        <button
          type="button"
          className={styles['actionButton']}
          disabled={remove.isPending}
          onClick={() => remove.mutate()}
        >
          remove
        </button>
      ) : null}
    </span>
  );
}

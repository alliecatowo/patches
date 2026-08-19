import { describeError } from '@patches/client';
import { AppealStatus, ModerationActionType } from '@patches/proto/es';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type JSX } from 'react';

import { api } from '../api/client.js';
import { humanizeEnumValue } from '../lib/enumLabels.js';
import { formatAbsoluteTime } from '../lib/format.js';
import styles from './AuthForm.module.css';

/**
 * `/appeals` (P14-018, spec §201.3) — moderation notices the caller can appeal, the
 * appeal form (max 2,000 chars, spec §204), and the caller's own appeals with status.
 * A notice's explanation is purpose-written for the subject at resolution time — never
 * `reports.moderator_note` (§55, §208), so nothing here can leak that field.
 */
export function AppealsRoute(): JSX.Element {
  const queryClient = useQueryClient();
  const [openNoticeId, setOpenNoticeId] = useState<string | null>(null);
  const [statement, setStatement] = useState('');

  const noticesQuery = useQuery({
    queryKey: ['moderation-notices'],
    queryFn: () => api.moderation.listMyModerationNotices({ cursor: '', limit: 50 }),
  });
  const appealsQuery = useQuery({
    queryKey: ['appeals'],
    queryFn: () => api.appeals.listMyAppeals({ cursor: '', limit: 50 }),
  });

  const createMutation = useMutation({
    mutationFn: (vars: { moderationNoticeId: string; statement: string }) =>
      api.appeals.createAppeal(vars),
    onSuccess: () => {
      setOpenNoticeId(null);
      setStatement('');
      void queryClient.invalidateQueries({ queryKey: ['appeals'] });
      void queryClient.invalidateQueries({ queryKey: ['moderation-notices'] });
    },
  });

  const notices = noticesQuery.data?.notices ?? [];
  const appeals = appealsQuery.data?.appeals ?? [];

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '1.5rem 1rem' }}>
      <h1>Appeals</h1>

      <section>
        <h2>Moderation notices</h2>
        {noticesQuery.isPending ? <p>Loading…</p> : null}
        {notices.length === 0 && !noticesQuery.isPending ? <p>No moderation notices.</p> : null}
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {notices.map((notice) => (
            <li
              key={notice.id}
              style={{ padding: '0.75rem 0', borderBottom: '1px solid var(--border)' }}
            >
              <strong>{humanizeEnumValue(notice.action, ModerationActionType)}</strong>
              <p>{notice.explanation}</p>
              <div style={{ color: 'var(--fg-muted)', fontSize: '0.85rem' }}>
                {formatAbsoluteTime(notice.createdAt)}
                {notice.appealDeadline
                  ? ` · appeal by ${formatAbsoluteTime(notice.appealDeadline)}`
                  : ''}
              </div>
              {notice.appealed ? (
                <p style={{ color: 'var(--fg-muted)' }}>Already appealed.</p>
              ) : openNoticeId === notice.id ? (
                <div style={{ marginTop: '0.5rem' }}>
                  <textarea
                    className={styles['field']}
                    value={statement}
                    maxLength={2000}
                    rows={4}
                    onChange={(e) => setStatement(e.target.value)}
                    placeholder="Why should this decision be reconsidered?"
                  />
                  {createMutation.isError ? (
                    <p className={styles['error']}>{describeError(createMutation.error).message}</p>
                  ) : null}
                  <button
                    type="button"
                    className={styles['submit']}
                    style={{ width: 'auto' }}
                    disabled={statement.trim() === '' || createMutation.isPending}
                    onClick={() =>
                      createMutation.mutate({
                        moderationNoticeId: notice.id,
                        statement: statement.trim(),
                      })
                    }
                  >
                    Submit appeal
                  </button>{' '}
                  <button type="button" onClick={() => setOpenNoticeId(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setOpenNoticeId(notice.id);
                    setStatement('');
                  }}
                >
                  Appeal
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2>Your appeals</h2>
        {appeals.length === 0 ? <p>No appeals filed.</p> : null}
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {appeals.map((appeal) => (
            <li
              key={appeal.id}
              style={{ padding: '0.6rem 0', borderBottom: '1px solid var(--border)' }}
            >
              Status: <strong>{humanizeEnumValue(appeal.status, AppealStatus)}</strong>
              <p>{appeal.statement}</p>
              {appeal.status !== AppealStatus.OPEN && appeal.resolutionReason ? (
                <p style={{ color: 'var(--fg-muted)' }}>{appeal.resolutionReason}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

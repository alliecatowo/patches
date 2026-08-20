import { toDate } from '../api/wire/time.js';
import type { Appeal, ModerationNotice } from '../api/wire/types.js';
import { useCallback, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import type { PatchesApi } from '../api/client.js';
import { present } from '../api/present.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { Loading } from '../components/Loading.js';
import { usePaginatedList, type Page } from '../hooks/usePaginatedPosts.js';
import { theme } from '../theme/index.js';

export interface AppealsScreenProps {
  api: PatchesApi;
  isActive: boolean;
  ensureAccessToken: () => Promise<string>;
  /** `Esc` — back to whichever screen `:appeals` was opened from. */
  onBack: () => void;
}

type Tab = 'notices' | 'appeals';

function actionLabel(action: string): string {
  return action.replace('MODERATION_ACTION_TYPE_', '').toLowerCase();
}
function statusLabel(status: string): string {
  return status.replace('APPEAL_STATUS_', '').toLowerCase();
}

/**
 * `:appeals` — the caller's own moderation notices and the appeals filed against
 * them (spec §201.3). Only the acted-upon actor may appeal, one appeal per
 * notice; resolution is admin-CLI-only, so this screen is read-only once filed.
 */
export function AppealsScreen({
  api,
  isActive,
  ensureAccessToken,
  onBack,
}: AppealsScreenProps): ReactElement {
  const [tab, setTab] = useState<Tab>('notices');
  const [noticeSelected, setNoticeSelected] = useState(0);
  const [appealSelected, setAppealSelected] = useState(0);
  const [filing, setFiling] = useState(false);
  const [statement, setStatement] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [filedNoticeIds, setFiledNoticeIds] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState('');

  const fetchNotices = useCallback(
    async (cursor: string): Promise<Page<ModerationNotice>> => {
      const accessToken = await ensureAccessToken();
      const response = await api.listMyModerationNotices({ cursor, limit: 30 }, accessToken);
      return { items: response.notices, page: response.page };
    },
    [api, ensureAccessToken],
  );
  const notices = usePaginatedList<ModerationNotice>(api.target, fetchNotices);

  const fetchAppeals = useCallback(
    async (cursor: string): Promise<Page<Appeal>> => {
      const accessToken = await ensureAccessToken();
      const response = await api.listMyAppeals({ cursor, limit: 30 }, accessToken);
      return { items: response.appeals, page: response.page };
    },
    [api, ensureAccessToken],
  );
  const appeals = usePaginatedList<Appeal>(api.target, fetchAppeals);

  const noticeIndex = Math.min(noticeSelected, Math.max(notices.items.length - 1, 0));
  const appealIndex = Math.min(appealSelected, Math.max(appeals.items.length - 1, 0));
  const selectedNotice = notices.items[noticeIndex];

  async function submitAppeal(): Promise<void> {
    if (selectedNotice === undefined || statement.trim() === '' || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const accessToken = await ensureAccessToken();
      await api.createAppeal(
        { moderationNoticeId: selectedNotice.id, statement: statement.trim() },
        accessToken,
      );
      setFiledNoticeIds((current) => new Set(current).add(selectedNotice.id));
      setNotice('Appeal filed.');
      setFiling(false);
      setStatement('');
      appeals.refresh();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : String(thrown));
    } finally {
      setSubmitting(false);
    }
  }

  useInput(
    (input, key) => {
      if (filing) {
        if (key.escape) {
          setFiling(false);
          setStatement('');
          setError('');
          return;
        }
        if (submitting) return;
        if (key.return) {
          void submitAppeal();
          return;
        }
        if (key.backspace || key.delete) {
          setStatement((current) => current.slice(0, -1));
          return;
        }
        if (!key.ctrl && !key.meta && input.length > 0) setStatement((current) => current + input);
        return;
      }

      if (key.escape) {
        onBack();
        return;
      }
      if (key.tab) {
        setTab((current) => (current === 'notices' ? 'appeals' : 'notices'));
        return;
      }
      if (tab === 'notices') {
        if (notices.items.length === 0) return;
        if (input === 'j' || key.downArrow)
          setNoticeSelected(Math.min(notices.items.length - 1, noticeIndex + 1));
        else if (input === 'k' || key.upArrow) setNoticeSelected(Math.max(0, noticeIndex - 1));
        else if (input === 'n' && selectedNotice !== undefined && !selectedNotice.appealed) {
          setFiling(true);
          setStatement('');
        } else if (notices.hasMore && (input === 'm' || key.pageDown)) notices.loadMore();
        return;
      }
      if (appeals.items.length === 0) return;
      if (input === 'j' || key.downArrow)
        setAppealSelected(Math.min(appeals.items.length - 1, appealIndex + 1));
      else if (input === 'k' || key.upArrow) setAppealSelected(Math.max(0, appealIndex - 1));
      else if (appeals.hasMore && (input === 'm' || key.pageDown)) appeals.loadMore();
    },
    { isActive },
  );

  if (filing && selectedNotice !== undefined) {
    return (
      <Box flexDirection="column">
        <Text color={theme.accent}>Appeal — {actionLabel(selectedNotice.action)}</Text>
        <Text color={theme.muted} wrap="wrap">
          {sanitizeForTerminal(selectedNotice.explanation)}
        </Text>
        <Box marginTop={1}>
          <Text>{statement}</Text>
          <Text color={theme.accent}>█</Text>
        </Box>
        {error === '' ? null : <Text color={theme.error}>{sanitizeForTerminal(error)}</Text>}
        <Text color={theme.muted}>{submitting ? 'Filing…' : 'Enter file · Esc cancel'}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color={theme.accent}>
        Appeals — {tab === 'notices' ? 'moderation notices' : 'my appeals'}
      </Text>
      {tab === 'notices' ? (
        <Box flexDirection="column" marginTop={1}>
          {notices.error === undefined ? null : (
            <Text color={theme.error}>{sanitizeForTerminal(notices.error.title)}</Text>
          )}
          {notices.items.length === 0 ? (
            notices.loading ? (
              <Loading label="Loading notices" />
            ) : (
              <Text color={theme.muted}>No moderation notices.</Text>
            )
          ) : (
            notices.items.map((item, index) => {
              const appealed = item.appealed || filedNoticeIds.has(item.id);
              const deadline = toDate(item.appealDeadline);
              return (
                <Text
                  key={item.id}
                  color={isActive && index === noticeIndex ? theme.accent : theme.muted}
                  bold={isActive && index === noticeIndex}
                  wrap="truncate-end"
                >
                  {index === noticeIndex ? '› ' : '  '}
                  {actionLabel(item.action)} · {sanitizeForTerminal(item.explanation)}
                  {appealed
                    ? ' · appealed'
                    : present(deadline)
                      ? ` · appeal by ${deadline.toISOString()}`
                      : ''}
                </Text>
              );
            })
          )}
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {appeals.error === undefined ? null : (
            <Text color={theme.error}>{sanitizeForTerminal(appeals.error.title)}</Text>
          )}
          {appeals.items.length === 0 ? (
            appeals.loading ? (
              <Loading label="Loading appeals" />
            ) : (
              <Text color={theme.muted}>No appeals filed yet.</Text>
            )
          ) : (
            appeals.items.map((item, index) => (
              <Text
                key={item.id}
                color={isActive && index === appealIndex ? theme.accent : theme.muted}
                bold={isActive && index === appealIndex}
                wrap="truncate-end"
              >
                {index === appealIndex ? '› ' : '  '}
                {statusLabel(item.status)}
                {item.resolutionReason === ''
                  ? ''
                  : ` — ${sanitizeForTerminal(item.resolutionReason)}`}
              </Text>
            ))
          )}
        </Box>
      )}
      {notice === '' ? null : <Text color={theme.ok}>{notice}</Text>}
      <Text color={theme.muted}>
        Tab switch · j/k select{tab === 'notices' ? ' · n file appeal' : ''} · Esc back
      </Text>
    </Box>
  );
}

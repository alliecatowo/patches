import {
  ModerationActionType,
  ModerationLogSubjectKind,
  ModerationReasonCategory,
} from '@patches/proto/es';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { JSX } from 'react';

import { api } from '../../api/client.js';
import { humanizeEnumValue } from '../../lib/enumLabels.js';
import { formatAbsoluteTime } from '../../lib/format.js';

/**
 * `/moderation/log` (P14-018, spec §201.5) — this node's public, anonymized moderation
 * log. Account/post-kind entries never carry a handle, actor ID, or post ID (only the
 * action, reason category, and whether it was appealed) — domain entries are identified,
 * since a domain-level decision is inherently public policy.
 */
export function ModerationLogRoute(): JSX.Element {
  const query = useInfiniteQuery({
    queryKey: ['moderation-log'],
    queryFn: ({ pageParam }) => api.moderation.listModerationLog({ cursor: pageParam, limit: 30 }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => (lastPage.page?.hasMore ? lastPage.page.nextCursor : undefined),
  });

  const entries = query.data?.pages.flatMap((p) => p.entries) ?? [];

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '1.5rem 1rem' }}>
      <h1>Public moderation log</h1>
      <p style={{ color: 'var(--fg-muted)' }}>
        Account- and post-level entries are anonymized: no handle, actor ID, or post ID is ever
        shown here. Domain-level decisions are identified, since they are node policy.
      </p>
      {query.isPending ? <p>Loading…</p> : null}
      {entries.length === 0 && !query.isPending ? <p>No entries.</p> : null}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {entries.map((entry) => (
          <li
            key={entry.id}
            style={{ padding: '0.6rem 0', borderBottom: '1px solid var(--border)' }}
          >
            <strong>{humanizeEnumValue(entry.action, ModerationActionType)}</strong>
            {' — '}
            {humanizeEnumValue(entry.subjectKind, ModerationLogSubjectKind)}
            {entry.subjectKind === ModerationLogSubjectKind.DOMAIN && entry.subjectDomain
              ? ` (${entry.subjectDomain})`
              : ''}
            {entry.reasonCategory !== ModerationReasonCategory.UNSPECIFIED
              ? ` · ${humanizeEnumValue(entry.reasonCategory, ModerationReasonCategory)}`
              : ''}
            {entry.appealed ? ' · appealed' : ''}
            <div style={{ color: 'var(--fg-muted)', fontSize: '0.85rem' }}>
              {formatAbsoluteTime(entry.createdAt)}
            </div>
          </li>
        ))}
      </ul>
      {query.hasNextPage ? (
        <button
          type="button"
          onClick={() => void query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
        >
          {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      ) : null}
    </div>
  );
}

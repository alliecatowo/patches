import { useQuery } from '@tanstack/react-query';
import type { JSX } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../api/client.js';
import { DmNotice } from '../components/DmNotice.js';
import { useSession } from '../hooks/useSession.js';
import { formatRelativeTime } from '../lib/format.js';
import styles from './MessagesRoute.module.css';

export function MessagesRoute(): JSX.Element {
  const session = useSession();

  const query = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.messages.listConversations({ cursor: '', limit: 30 }),
  });

  return (
    <div>
      <h1 style={{ padding: '1rem 1rem 0' }}>Messages</h1>
      <DmNotice />
      {query.isPending ? <p style={{ padding: '1rem' }}>Loading…</p> : null}
      {query.data?.conversations.length === 0 ? (
        <p style={{ padding: '1rem', color: 'var(--fg-muted)' }}>No conversations yet.</p>
      ) : null}
      {query.data?.conversations.map((conversation) => {
        const other = conversation.members.find((m) => m.actor?.id !== session?.actor.id)?.actor;
        return (
          <Link key={conversation.id} to={`/messages/${conversation.id}`} className={styles['row']}>
            <span className={conversation.unreadCount > 0 ? styles['unread'] : ''}>
              @{other?.handle ?? 'conversation'}
            </span>
            <div className={styles['preview']}>
              {formatRelativeTime(conversation.lastMessageAt)}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

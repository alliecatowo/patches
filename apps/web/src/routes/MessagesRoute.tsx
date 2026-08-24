import { useQuery } from '@tanstack/react-query';
import { useState, type JSX } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../api/client.js';
import { DmNotice, securityModeLabel } from '../components/DmNotice.js';
import { PlusIcon } from '../components/icons/Icons.js';
import { NewMessageDialog } from '../components/NewMessageDialog.js';
import { useSession } from '../hooks/useSession.js';
import { formatRelativeTime } from '../lib/format.js';
import styles from './MessagesRoute.module.css';

export function MessagesRoute(): JSX.Element {
  const session = useSession();
  const [newMessageOpen, setNewMessageOpen] = useState(false);

  const query = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.messages.listConversations({ cursor: '', limit: 30 }),
  });

  return (
    <div>
      <div className={styles['headerRow']}>
        <h1>Messages</h1>
        <button
          type="button"
          className={styles['newMsgBtn']}
          onClick={() => setNewMessageOpen(true)}
          aria-label="New direct message"
        >
          <PlusIcon size={16} />
          <span>New Message</span>
        </button>
      </div>

      <DmNotice />

      {query.isPending ? <p style={{ padding: '1rem' }}>Loading…</p> : null}
      {query.data?.conversations.length === 0 ? (
        <p style={{ padding: '1rem', color: 'var(--fg-muted)' }}>No conversations yet.</p>
      ) : null}
      {query.data?.conversations.map((conversation) => {
        const other = conversation.members.find((m) => m.actor?.id !== session?.actor.id)?.actor;
        // Mode labels are facts read off the wire (`security_mode`, ADR 0020 §11) —
        // the route-level notice above stays neutral because the list mixes modes.
        const modeLabel = securityModeLabel(conversation.securityMode);
        return (
          <Link key={conversation.id} to={`/messages/${conversation.id}`} className={styles['row']}>
            <span className={conversation.unreadCount > 0 ? styles['unread'] : ''}>
              @{other?.handle ?? 'conversation'}
            </span>
            {modeLabel === undefined ? null : (
              <span className={styles['modeLabel']}>{modeLabel}</span>
            )}
            <div className={styles['preview']}>
              {formatRelativeTime(conversation.lastMessageAt)}
            </div>
          </Link>
        );
      })}

      <NewMessageDialog isOpen={newMessageOpen} onClose={() => setNewMessageOpen(false)} />
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import type { JSX } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../api/client.js';
import { DmNotice, securityModeLabel } from '../components/DmNotice.js';
import { PlusIcon } from '../components/icons/Icons.js';
import { useToast } from '../components/ToastProvider.js';
import { useSession } from '../hooks/useSession.js';
import { formatRelativeTime } from '../lib/format.js';
import styles from './MessagesRoute.module.css';

/** B-095/B-096: no client-creatable-conversation RPC survives for a web view with no
 * E2EE key material — starting a conversation needs the terminal client's vault. */
const START_CONVERSATION_HINT =
  'Start a new conversation from the terminal client — this web view has no encryption keys to create one.';

export function MessagesRoute(): JSX.Element {
  const session = useSession();
  const toast = useToast();

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
          onClick={() => toast.pushToast({ message: START_CONVERSATION_HINT, tone: 'info' })}
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
    </div>
  );
}

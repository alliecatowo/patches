import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type JSX } from 'react';
import { Link, useParams } from 'react-router-dom';

import { api } from '../api/client.js';
import { DmNotice } from '../components/DmNotice.js';
import { useErrorToast } from '../hooks/useErrorToast.js';
import { useSession } from '../hooks/useSession.js';
import { formatRelativeTime } from '../lib/format.js';
import styles from './MessagesRoute.module.css';

/**
 * `/messages/:id` — direct message conversation.
 * The mandatory not-E2E-encrypted notice (§183.1) is always visible here.
 */
export function MessageThreadRoute(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const conversationId = id ?? '';
  const session = useSession();
  const onError = useErrorToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const query = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => api.messages.listMessages({ conversationId, cursor: '', limit: 50 }),
    enabled: conversationId !== '',
  });

  const sendMutation = useMutation({
    mutationFn: (body: string) =>
      api.messages.sendMessage({ clientRequestId: crypto.randomUUID(), conversationId, body }),
    onSuccess: () => {
      setDraft('');
      void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    },
    onError,
  });

  const messages = query.data?.messages ?? [];

  // Scroll to bottom when messages load or change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div className={styles['thread']}>
      <DmNotice />

      <div className={styles['messages']}>
        {messages.length === 0 && !query.isPending ? (
          <div className={styles['emptyThread']}>
            <p>No messages yet. Send a message to start the conversation.</p>
          </div>
        ) : null}

        {[...messages].reverse().map((message) => {
          const isMine = message.sender?.id === session?.actor.id;
          return (
            <div
              key={message.id}
              className={`${styles['bubble']} ${isMine ? styles['mine'] : styles['theirs']}`}
            >
              {!isMine && message.sender ? (
                <Link to={`/@${message.sender.handle}`} className={styles['senderHandle']}>
                  @{message.sender.handle}
                </Link>
              ) : null}
              <div className={styles['bubbleBody']}>{message.body}</div>
              <div className={styles['time']}>{formatRelativeTime(message.createdAt)}</div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <form
        className={styles['composer']}
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim() === '') return;
          sendMutation.mutate(draft);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a message…"
          aria-label="Message"
          className={styles['composerInput']}
        />
        <button
          type="submit"
          disabled={sendMutation.isPending || draft.trim() === ''}
          className={styles['sendBtn']}
        >
          {sendMutation.isPending ? '…' : 'Send'}
        </button>
      </form>
    </div>
  );
}

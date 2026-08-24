import { ConversationSecurityMode } from '@patches/proto/es';
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
 * The disclosure is keyed to the conversation's wire `security_mode` (ADR 0020
 * §11): E2EE_V1 threads say they open in the terminal client (this web view has
 * no crypto runtime and its plaintext send path is rejected by the node),
 * LEGACY threads carry the mandated §183.1 notice, and until the conversation
 * loads neither claim is asserted.
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

  const conversationQuery = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => api.messages.getConversation({ id: conversationId }),
    enabled: conversationId !== '',
  });
  const securityMode = conversationQuery.data?.conversation?.securityMode;
  const isE2ee = securityMode === ConversationSecurityMode.E2EE_V1;

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
      <DmNotice securityMode={securityMode} />

      <div className={styles['messages']}>
        {messages.length === 0 && !query.isPending ? (
          <div className={styles['emptyThread']}>
            <p>
              {isE2ee
                ? 'No messages here yet — this conversation lives in the terminal client.'
                : 'No messages yet. Send a message to start the conversation.'}
            </p>
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
          if (draft.trim() === '' || isE2ee) return;
          sendMutation.mutate(draft);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            isE2ee ? 'Open this conversation in the terminal client to reply' : 'Write a message…'
          }
          aria-label="Message"
          disabled={isE2ee}
          className={styles['composerInput']}
        />
        <button
          type="submit"
          disabled={sendMutation.isPending || isE2ee || draft.trim() === ''}
          className={styles['sendBtn']}
        >
          {sendMutation.isPending ? '…' : 'Send'}
        </button>
      </form>
    </div>
  );
}

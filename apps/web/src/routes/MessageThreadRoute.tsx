import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type JSX } from 'react';
import { useParams } from 'react-router-dom';

import { api } from '../api/client.js';
import { DmNotice } from '../components/DmNotice.js';
import { useErrorToast } from '../hooks/useErrorToast.js';
import { useSession } from '../hooks/useSession.js';
import { formatRelativeTime } from '../lib/format.js';
import styles from './MessagesRoute.module.css';

/** `/messages/:id` — the mandatory not-E2E-encrypted notice (§183.1) is always visible here. */
export function MessageThreadRoute(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const conversationId = id ?? '';
  const session = useSession();
  const onError = useErrorToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');

  const query = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => api.directMessage.listMessages({ conversationId, cursor: '', limit: 50 }),
    enabled: conversationId !== '',
  });

  const sendMutation = useMutation({
    mutationFn: (body: string) =>
      api.directMessage.sendMessage({ clientRequestId: crypto.randomUUID(), conversationId, body }),
    onSuccess: () => {
      setDraft('');
      void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    },
    onError,
  });

  const messages = query.data?.messages ?? [];

  return (
    <div className={styles['thread']}>
      <DmNotice />
      <div className={styles['messages']}>
        {[...messages].reverse().map((message) => (
          <div
            key={message.id}
            className={`${styles['bubble']} ${message.sender?.id === session?.actor.id ? styles['mine'] : ''}`}
          >
            <div>{message.body}</div>
            <div className={styles['preview']}>{formatRelativeTime(message.createdAt)}</div>
          </div>
        ))}
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
          placeholder="Message…"
          aria-label="Message"
        />
        <button type="submit" disabled={sendMutation.isPending || draft.trim() === ''}>
          Send
        </button>
      </form>
    </div>
  );
}

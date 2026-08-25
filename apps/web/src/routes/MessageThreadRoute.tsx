import { useQuery } from '@tanstack/react-query';
import type { JSX } from 'react';
import { useParams } from 'react-router-dom';

import { api } from '../api/client.js';
import { DmNotice } from '../components/DmNotice.js';
import styles from './MessagesRoute.module.css';

/**
 * `/messages/:id` — direct message conversation.
 *
 * B-095/B-096 (ADR 0030) removed every plaintext DM RPC: this web client never held E2EE
 * key material, so there is no surface here that can list or send a conversation's
 * content any more — only its metadata (`GetConversation`) survives. The disclosure
 * (`DmNotice`) is still keyed off the conversation's wire `security_mode` (ADR 0020 §11)
 * rather than assumed, even though every conversation reachable today is `E2EE_V1`.
 */
export function MessageThreadRoute(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const conversationId = id ?? '';

  const conversationQuery = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => api.messages.getConversation({ id: conversationId }),
    enabled: conversationId !== '',
  });
  const conversation = conversationQuery.data?.conversation;
  const securityMode = conversation?.securityMode;

  const otherMembers = conversation?.members.filter((member) => member.leftAt === undefined) ?? [];

  return (
    <div className={styles['thread']}>
      <DmNotice securityMode={securityMode} />

      <div className={styles['messages']}>
        <div className={styles['emptyThread']}>
          <p>
            {conversationQuery.isPending
              ? 'Loading…'
              : otherMembers.length === 0
                ? 'This conversation could not be loaded.'
                : `Open this conversation with ${otherMembers
                    .map((member) => (member.actor ? `@${member.actor.handle}` : 'unknown actor'))
                    .join(', ')} in the terminal client to read or reply.`}
          </p>
        </div>
      </div>
    </div>
  );
}

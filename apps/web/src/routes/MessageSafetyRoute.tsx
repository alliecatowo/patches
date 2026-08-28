import { useQuery } from '@tanstack/react-query';
import type { JSX } from 'react';
import { Link, useParams } from 'react-router-dom';

import { api } from '../api/client.js';
import { GroupControlTranscript } from '../components/e2ee/GroupControlTranscript.js';
import { SafetyNumberPanel } from '../components/e2ee/SafetyNumberPanel.js';
import { useE2ee, useE2eeVaultAccess } from '../e2ee/use-e2ee.js';
import { useSession } from '../hooks/useSession.js';

/**
 * `/messages/:id/safety` (issue #168) — the verification surface a `MessageThreadRoute`
 * link reaches: a safety-number comparison per other member, plus the conversation's
 * signed membership transcript. Kept as its own route (not inline in the thread) so it
 * has room for every member of a group conversation, not just a 1:1 peer.
 */
export function MessageSafetyRoute(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const conversationId = id ?? '';
  const session = useSession();
  const e2eeStatus = useE2ee(session);
  const { vault, actorId, transport, ready, error } = useE2eeVaultAccess(e2eeStatus);

  const conversationQuery = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => api.messages.getConversation({ id: conversationId }),
    enabled: conversationId !== '',
  });
  const conversation = conversationQuery.data?.conversation;
  const otherMembers = (conversation?.members ?? []).filter(
    (member) => member.leftAt === undefined && member.actor?.id !== actorId,
  );

  return (
    <div style={{ padding: '1rem' }}>
      <p>
        <Link to={`/messages/${conversationId}`}>Back to conversation</Link>
      </p>
      <h1>Verify this conversation</h1>
      {error ? (
        <p role="alert">The encrypted message store in this browser could not be opened here.</p>
      ) : null}
      {!ready || actorId === undefined || vault === undefined || transport === undefined ? (
        <p role="status">Loading…</p>
      ) : (
        <>
          {otherMembers.length === 0 ? <p>No other members to verify.</p> : null}
          {otherMembers.map((member) =>
            member.actor === undefined ? null : (
              <SafetyNumberPanel
                key={member.actor.id}
                myActorId={actorId}
                targetActorId={member.actor.id}
                targetHandle={member.actor.handle}
                transport={transport}
                vault={vault}
              />
            ),
          )}
          <GroupControlTranscript conversationId={conversationId} transport={transport} />
        </>
      )}
    </div>
  );
}

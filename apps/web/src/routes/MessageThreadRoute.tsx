import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { api } from '../api/client.js';
import { ConversationSecurityMode } from '@patches/proto/es';
import { requiredConversationDisclosure } from '@patches/domain';
import type { InboxRow } from '../e2ee/runtime.js';
import { useE2ee } from '../e2ee/use-e2ee.js';
import {
  webE2ee,
  usePeerIdentityEvents,
  WEB_E2EE_COPY,
  WebE2eeUnavailableError,
} from '../e2ee/web-e2ee.js';
import { useSession } from '../hooks/useSession.js';
import { ChatShell } from '../messages/ChatShell.js';
import { ConversationListPane } from '../messages/ConversationListPane.js';
import { Composer } from '../messages/Composer.js';
import { MessageList } from '../messages/MessageList.js';
import { useConversationsQuery } from '../messages/useConversationsQuery.js';
import { useQuery } from '@tanstack/react-query';
import { WEB_DM_POLL_MS } from '../lib/poll-intervals.js';
import { toast } from 'sonner';

const POLL_INTERVAL_MS = 8_000;

/**
 * `/messages/:id` — an E2EE conversation thread rendered inside the two-pane chat shell
 * (#321): conversation list on the left, this thread on the right; stacked with a back link
 * below tablet width. The node serves only metadata (`GetConversation`); bodies are decrypted
 * in this browser through the enrolled device's mailbox (`webE2ee().poll`), and sends go
 * through the sealed-envelope fanout (`webE2ee().send`). Nothing plaintext ever touches the
 * wire here.
 */
export function MessageThreadRoute(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const conversationId = id ?? '';
  const session = useSession();
  const e2eeStatus = useE2ee(session);
  const navigate = useNavigate();
  const actorId = session?.actor.id;

  const conversationsQuery = useConversationsQuery();
  const conversationQuery = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => api.messages.getConversation({ id: conversationId }),
    enabled: conversationId !== '',
    // ADR 0032 §1: thread metadata updates within 60s while the tab is focused; single
    // source of truth in `lib/poll-intervals.ts` (P19-021).
    refetchInterval: WEB_DM_POLL_MS,
    refetchOnWindowFocus: true,
  });
  const conversation = conversationQuery.data?.conversation;
  const securityMode = conversation?.securityMode;
  const disclosedByConversation = securityMode === ConversationSecurityMode.E2EE_V1;

  const otherMembers = conversation?.members.filter((member) => member.leftAt === undefined) ?? [];
  const identityEvents = usePeerIdentityEvents();
  const memberIdentityEvents = identityEvents.filter((event) =>
    otherMembers.some((member) => member.actor?.id === event.actorId),
  );

  const [rows, setRows] = useState<readonly InboxRow[]>([]);
  const seenIds = useRef(new Set<string>());
  const [notice, setNotice] = useState<string | null>(null);
  const [sendFailed, setSendFailed] = useState(false);
  const [lastDraft, setLastDraft] = useState('');
  const [sending, setSending] = useState(false);

  const enrolled = e2eeStatus.kind === 'enrolled';

  useEffect(() => {
    if (!enrolled || conversationId === '') return;
    let cancelled = false;
    const poll = async (): Promise<void> => {
      try {
        const fresh = await webE2ee().poll(conversationId);
        if (cancelled) return;
        setRows((previous) => {
          const merged = [...previous];
          for (const row of fresh) {
            if (seenIds.current.has(row.id)) continue;
            seenIds.current.add(row.id);
            merged.push(row);
          }
          return merged;
        });
        setNotice(null);
      } catch {
        if (!cancelled) setNotice(WEB_E2EE_COPY.pollFailed);
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enrolled, conversationId]);

  async function handleSend(body: string): Promise<void> {
    setSending(true);
    setLastDraft(body);
    try {
      await webE2ee().send(conversationId, body);
      const local: InboxRow = {
        kind: 'message',
        id: `local-${crypto.randomUUID()}`,
        senderLabel: 'you',
        body,
        sentByViewer: true,
      };
      seenIds.current.add(local.id);
      setRows((previous) => [...previous, local]);
      setSendFailed(false);
    } catch (error) {
      setSendFailed(true);
      toast.error(
        error instanceof WebE2eeUnavailableError ? error.message : WEB_E2EE_COPY.sendFailed,
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <ChatShell
      mobilePane="detail"
      detailTitle="Messages"
      list={
        <ConversationListPane
          conversations={conversationsQuery.data?.conversations}
          viewerActorId={actorId}
          isPending={conversationsQuery.isPending}
          pollFailed={conversationsQuery.isError}
          activeConversationId={conversationId}
          canCompose={enrolled}
          onNewMessage={() => void navigate('/messages')}
        />
      }
      detail={
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {disclosedByConversation ? (
            <p
              role="note"
              style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', color: 'var(--fg-muted)' }}
            >
              {requiredConversationDisclosure('E2EE_V1')}
            </p>
          ) : null}

          {memberIdentityEvents.map((event) => (
            <p
              key={event.kind + event.actorId}
              role="note"
              style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', color: 'var(--fg-muted)' }}
            >
              {event.kind === 'first-seen'
                ? 'This is the first message to this identity on this device — it is not verified yet. ' +
                  'Confirm it with them out-of-band before trusting this conversation.'
                : 'This member rotated their messaging identity. The rotation was verified against their previous key.'}
            </p>
          ))}

          {e2eeStatus.kind === 'not-enrolled' || e2eeStatus.kind === 'refused' ? (
            <div
              role="note"
              style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', color: 'var(--fg-muted)' }}
            >
              <p>
                {WEB_E2EE_COPY.notEnrolled} This browser can be enrolled as a messaging device from
                the Messages list.
              </p>
            </div>
          ) : null}
          {e2eeStatus.kind === 'fault' ? (
            <div
              role="alert"
              style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', color: 'var(--fg-muted)' }}
            >
              <p>{e2eeStatus.copy}</p>
            </div>
          ) : null}

          {conversationQuery.isPending && rows.length === 0 ? (
            <div style={{ margin: 'auto', color: 'var(--fg-muted)' }}>
              <p>Loading…</p>
            </div>
          ) : null}
          {!conversationQuery.isPending && otherMembers.length === 0 && rows.length === 0 ? (
            <div style={{ margin: 'auto', color: 'var(--fg-muted)' }}>
              <p>This conversation could not be loaded.</p>
            </div>
          ) : null}
          {rows.length === 0 &&
          enrolled &&
          !conversationQuery.isPending &&
          otherMembers.length > 0 ? (
            <div style={{ margin: 'auto', color: 'var(--fg-muted)' }}>
              <p>No decrypted messages yet on this device.</p>
            </div>
          ) : null}
          {rows.length > 0 ? (
            <MessageList rows={rows} initialUnreadCount={conversation?.unreadCount ?? 0} />
          ) : null}
          {notice === null ? null : (
            <div style={{ margin: 'auto', color: 'var(--fg-muted)' }}>
              <p>{notice}</p>
            </div>
          )}

          {enrolled ? (
            <Composer
              status={sending ? 'sending' : sendFailed ? 'failed' : undefined}
              onSend={(body) => void handleSend(body)}
              onRetry={() => void handleSend(lastDraft)}
            />
          ) : null}
        </div>
      }
    />
  );
}

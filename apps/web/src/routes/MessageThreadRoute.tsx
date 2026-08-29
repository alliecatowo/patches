import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { api } from '../api/client.js';
import { ConversationSecurityMode } from '@patches/proto/es';
import { requiredConversationDisclosure } from '@patches/domain';
import type { InboxRow } from '../e2ee/runtime.js';
import { mergeUnread } from '../e2ee/conversation-unread.js';
import { useE2ee } from '../e2ee/use-e2ee.js';
import { useLocalUnreadCounts } from '../e2ee/use-local-unread.js';
import {
  webE2ee,
  usePeerIdentityEvents,
  WEB_E2EE_COPY,
  WebE2eeUnavailableError,
} from '../e2ee/web-e2ee.js';
import { PEER_IDENTITY_CHANGED_COPY, PEER_ROSTER_CHANGED_COPY } from '../e2ee/peer-security.js';
import { usePeerSecurityWatch } from '../messages/usePeerSecurityWatch.js';
import { useSession } from '../hooks/useSession.js';
import { ComposeIcon } from '../components/icons/Icons.js';
import { Button, EmptyState, SelectConversationIllustration } from '../components/ui/index.js';
import { ChatShell } from '../messages/ChatShell.js';
import { ConversationListPane } from '../messages/ConversationListPane.js';
import { Composer } from '../messages/Composer.js';
import { MessageList } from '../messages/MessageList.js';
import { ThreadHeader } from '../messages/ThreadHeader.js';
import { ThreadNotice } from '../messages/ThreadNotice.js';
import { useConversationsQuery } from '../messages/useConversationsQuery.js';
import styles from '../messages/ThreadPane.module.css';
import { E2eeStatusChip } from '../messages/E2eeStatusChip.js';
import { useQuery } from '@tanstack/react-query';
import { nextPollDelayMs, POLL_BACKOFF_MAX_MS, WEB_DM_POLL_MS } from '../lib/poll-intervals.js';
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
  const peerActorId = otherMembers[0]?.actor?.id;
  const peerSecurityStatus = usePeerSecurityWatch(conversationId, peerActorId);

  const [rows, setRows] = useState<readonly InboxRow[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [sendFailed, setSendFailed] = useState(false);
  const [lastDraft, setLastDraft] = useState('');
  const [sending, setSending] = useState(false);

  const enrolled = e2eeStatus.kind === 'enrolled';
  const localUnread = useLocalUnreadCounts(
    conversationsQuery.data?.conversations.map((c) => c.id) ?? [],
    enrolled,
  );

  // #383: opening a thread marks it read on this device AND on the node (server-managed
  // `unreadCount`). The local clear is durable in the vault, so a locally-read thread stays
  // read across a reload even if the server's count lags. Fires once per open; a failed
  // server call must never resurface unread.
  useEffect(() => {
    if (!enrolled || conversationId === '' || otherMembers.length === 0) return;
    // Best-effort local clear: without an open device vault (not really enrolled) there is
    // nothing to clear, and a failed write must never surface as an error here.
    void webE2ee()
      .clearLocalUnread(conversationId)
      .catch(() => {
        // no vault to clear — moot
      });
    void api.messages.markConversationRead({ conversationId, throughMessageId: '' }).catch(() => {
      // Best-effort sync with the node — the durable local clear is already authoritative
      // for this device, so a failed RPC does not resurrect unread.
    });
  }, [enrolled, conversationId, otherMembers.length]);

  useEffect(() => {
    if (!enrolled || conversationId === '') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // P19-027 / issue #384: bounded backoff on consecutive transient poll failures so a
    // sustained outage does not hammer the drain at the fixed 8s cadence. A success resets
    // the count, collapsing the gap straight back to the base interval. Drained envelopes
    // are persisted to the vault (issue #352) before this callback sees them, so backing
    // off loses nothing: the next poll re-reads them from the vault.
    let consecutiveFailures = 0;
    const poll = async (): Promise<void> => {
      if (cancelled) return;
      try {
        // reading:true — this is the open thread; what drains here is being read live and
        // must not count toward the durable unread (#383).
        const fresh = await webE2ee().poll(conversationId, { reading: true });
        if (cancelled) return;
        // Dedupe against the rows this updater is actually given, never against a ref.
        // A `setState` updater must be pure: React may call it more than once for a single
        // update, and a version that mutated an external `seenIds` set marked every row as
        // already-seen on the first call and then dropped it on the second — the surviving
        // return value. Nothing rendered, and because `poll()` acknowledges what it drains,
        // the message was gone for good.
        setRows((previous) => {
          const seen = new Set(previous.map((row) => row.id));
          const merged = [...previous];
          for (const row of fresh) {
            if (seen.has(row.id)) continue;
            seen.add(row.id);
            merged.push(row);
          }
          return merged;
        });
        setNotice(null);
        // A successful poll collapses the backoff straight back to the base interval.
        consecutiveFailures = 0;
      } catch {
        if (!cancelled) setNotice(WEB_E2EE_COPY.pollFailed);
        // Each transient failure widens the gap up to the capped ceiling (P19-027 / #384).
        consecutiveFailures += 1;
      }
      if (cancelled) return;
      const delay = nextPollDelayMs(consecutiveFailures, POLL_INTERVAL_MS, POLL_BACKOFF_MAX_MS);
      timer = setTimeout(() => void poll(), delay);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [enrolled, conversationId]);

  async function handleSend(body: string): Promise<void> {
    // A-072: refuse (not warn) on peer identity/roster change since this thread opened, mirroring
    // the TUI. Consuming a persisted draft is never a send — the refusal must not touch the draft.
    if (
      peerSecurityStatus.status === 'identityChanged' ||
      peerSecurityStatus.status === 'rosterChanged'
    ) {
      toast.error(
        peerSecurityStatus.status === 'identityChanged'
          ? PEER_IDENTITY_CHANGED_COPY
          : PEER_ROSTER_CHANGED_COPY,
      );
      return;
    }
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

  const peer = otherMembers[0]?.actor;
  const peerHandle = peer?.handle;
  const peerName =
    peer?.displayName ?? (peerHandle === undefined ? 'Conversation' : `@${peerHandle}`);
  const threadEmpty = rows.length === 0;

  return (
    <ChatShell
      title="Messages"
      mobilePane="detail"
      statusChip={<E2eeStatusChip status={e2eeStatus} />}
      action={
        enrolled ? (
          <Button
            variant="primary"
            iconOnly
            icon={<ComposeIcon size={18} />}
            aria-label="New direct message"
            onClick={() => void navigate('/messages')}
          />
        ) : undefined
      }
      list={
        <ConversationListPane
          conversations={conversationsQuery.data?.conversations}
          viewerActorId={actorId}
          isPending={conversationsQuery.isPending}
          pollFailed={conversationsQuery.isError}
          activeConversationId={conversationId}
          canCompose={enrolled}
          localUnread={localUnread}
          onNewMessage={() => void navigate('/messages')}
        />
      }
      detail={
        <div className={styles['thread']}>
          <ThreadHeader
            name={peerName}
            handle={peerHandle}
            avatarUrl={peer?.avatar?.url}
            backTo="/messages"
            safetyTo={otherMembers.length === 0 ? undefined : `/messages/${conversationId}/safety`}
          />

          {disclosedByConversation ? (
            <ThreadNotice>{requiredConversationDisclosure('E2EE_V1')}</ThreadNotice>
          ) : null}

          {memberIdentityEvents.map((event) => (
            <ThreadNotice key={event.kind + event.actorId} tone="warning">
              {event.kind === 'first-seen'
                ? 'This is the first message to this identity on this device — it is not verified yet. ' +
                  'Confirm it with them out-of-band before trusting this conversation.'
                : 'This member rotated their messaging identity. The rotation was verified against their previous key.'}
            </ThreadNotice>
          ))}

          {peerSecurityStatus.status === 'identityChanged' ? (
            <ThreadNotice tone="alert" role="alert">
              {PEER_IDENTITY_CHANGED_COPY}
            </ThreadNotice>
          ) : peerSecurityStatus.status === 'rosterChanged' ? (
            <ThreadNotice tone="warning" role="alert">
              {PEER_ROSTER_CHANGED_COPY}
            </ThreadNotice>
          ) : null}

          {e2eeStatus.kind === 'not-enrolled' || e2eeStatus.kind === 'refused' ? (
            <ThreadNotice tone="warning">
              {WEB_E2EE_COPY.notEnrolled} This browser can be enrolled as a messaging device from
              the Messages list.
            </ThreadNotice>
          ) : null}
          {e2eeStatus.kind === 'fault' ? (
            <ThreadNotice tone="alert" role="alert">
              {e2eeStatus.copy}
            </ThreadNotice>
          ) : null}
          {notice === null ? null : (
            <ThreadNotice tone="warning" role="status">
              {notice}
            </ThreadNotice>
          )}

          {conversationQuery.isPending && threadEmpty ? (
            <EmptyState compact title="Loading…" />
          ) : !conversationQuery.isPending && otherMembers.length === 0 && threadEmpty ? (
            <EmptyState
              compact
              illustration={<SelectConversationIllustration size={96} />}
              title="This conversation could not be loaded."
              description="It may have been deleted, or this device may not be a member of it."
            />
          ) : threadEmpty ? (
            <MessageList
              rows={rows}
              initialUnreadCount={0}
              emptyLabel={
                enrolled
                  ? 'No decrypted messages yet on this device.'
                  : 'Nothing to show on this device yet.'
              }
            />
          ) : (
            <MessageList
              rows={rows}
              initialUnreadCount={mergeUnread(
                conversation?.unreadCount ?? 0,
                localUnread.get(conversationId),
              )}
            />
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

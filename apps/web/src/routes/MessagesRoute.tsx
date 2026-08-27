import { useQuery } from '@tanstack/react-query';
import type { JSX } from 'react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { api } from '../api/client.js';
import { securityModeLabel } from '../components/DmNotice.js';
import { PlusIcon } from '../components/icons/Icons.js';
import { requiredConversationDisclosure } from '@patches/domain';
import { useSession } from '../hooks/useSession.js';
import { formatRelativeTime } from '../lib/format.js';
import { WEB_DM_POLL_MS } from '../lib/poll-intervals.js';
import { useE2ee } from '../e2ee/use-e2ee.js';
import { webE2ee, WEB_E2EE_COPY, WebE2eeUnavailableError } from '../e2ee/web-e2ee.js';
import styles from './MessagesRoute.module.css';

const panelStyle = {
  padding: '0.5rem 1rem',
  color: 'var(--fg-muted)',
  fontSize: '0.85rem',
} as const;

const buttonStyle = {
  marginTop: '0.4rem',
} as const;

/**
 * P19-017: extends this client's poll-failure house rule to the conversation list —
 * nothing about a failed `ListConversations` poll may be mistaken for a genuinely empty
 * inbox. Shown whenever the query is in an error state, whether or not a prior
 * successful fetch left conversations on screen.
 */
export const DM_LIST_POLL_FAILED_COPY = 'Could not load conversations.';

/**
 * Conversations list. Since B-095/B-096 every conversation is `E2EE_V1`, this browser holds
 * its own enrolled messaging device, and — since ADR 0033 unified the identity transcripts
 * and ADR 0035 made creation a reserve — it can establish a real session and send. "New
 * Message" reserves a conversation and sends the first message into it.
 */
export function MessagesRoute(): JSX.Element {
  const session = useSession();
  const e2eeStatus = useE2ee(session);
  const [enrolling, setEnrolling] = useState(false);
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.messages.listConversations({ cursor: '', limit: 30 }),
    // ADR 0032 §1: the DM list updates within 60s while the tab is focused; single
    // source of truth in `lib/poll-intervals.ts` (P19-021). `refetchIntervalInBackground`
    // stays at its TanStack Query default (`false`), which already suspends this
    // interval while the tab is hidden/unfocused — see `docs/research/tanstack-query.md`.
    refetchInterval: WEB_DM_POLL_MS,
    // Re-enabled for this query only; the app-wide default in `main.tsx` stays off.
    // A DM inbox that silently misses new messages while backgrounded is exactly the
    // gap ADR 0032 closes, so tabbing back in should refresh immediately rather than
    // wait up to another `WEB_DM_POLL_MS`.
    refetchOnWindowFocus: true,
  });

  async function handleEnroll(): Promise<void> {
    setEnrolling(true);
    try {
      const outcome = await webE2ee().enroll();
      if (outcome.status === 'enrolled') {
        toast(WEB_E2EE_COPY.peerWarning);
      }
    } catch (error) {
      toast.error(
        error instanceof WebE2eeUnavailableError ? error.message : WEB_E2EE_COPY.enrollFailed,
      );
    } finally {
      setEnrolling(false);
    }
  }

  async function handleNewMessage(): Promise<void> {
    const recipient = window.prompt('Recipient actor id')?.trim();
    if (recipient === undefined || recipient === '') return;
    const body = window.prompt('First message')?.trim();
    if (body === undefined || body === '') return;
    try {
      const conversationId = await webE2ee().createConversation([recipient], body);
      void navigate(`/messages/${conversationId}`);
    } catch (error) {
      toast(error instanceof WebE2eeUnavailableError ? error.message : WEB_E2EE_COPY.sendFailed);
    }
  }

  return (
    <div>
      <div className={styles['headerRow']}>
        <h1>Messages</h1>
        {e2eeStatus.kind === 'enrolled' ? (
          <button
            type="button"
            className={styles['newMsgBtn']}
            onClick={() => void handleNewMessage()}
            aria-label="New direct message"
          >
            <PlusIcon size={16} />
            <span>New Message</span>
          </button>
        ) : null}
      </div>

      <E2eePanel
        status={e2eeStatus}
        enrolling={enrolling}
        onEnroll={() => void handleEnroll()}
        onWipe={() => void webE2ee().wipe()}
      />

      {query.isPending ? <p style={{ padding: '1rem' }}>Loading…</p> : null}
      {query.isError && query.data === undefined ? (
        <p role="alert" style={{ padding: '1rem', color: 'var(--fg-muted)' }}>
          {DM_LIST_POLL_FAILED_COPY}
        </p>
      ) : null}
      {query.data === undefined ? null : (
        <ConversationList
          conversations={query.data.conversations}
          viewerActorId={session?.actor.id}
          pollFailed={query.isError}
        />
      )}
    </div>
  );
}

type ConversationsResult = Awaited<ReturnType<typeof api.messages.listConversations>>;
type ConversationRow = ConversationsResult['conversations'][number];

/**
 * The conversation rows AND the §183.1 disclosure as one unit: it is structurally
 * impossible to render a row here without the disclosure appearing above it, in every
 * `E2eePanel` status (including `fault`, which is sticky — see `web-e2ee.ts:158-162`).
 */
function ConversationList({
  conversations,
  viewerActorId,
  pollFailed,
}: {
  conversations: readonly ConversationRow[];
  viewerActorId: string | undefined;
  /** P19-017: the most recent `ListConversations` poll failed. An empty list under a
   * failed poll is never claimed as "no conversations yet" — that would assert a fact
   * this fetch didn't actually confirm. */
  pollFailed: boolean;
}): JSX.Element | null {
  if (conversations.length === 0) {
    return (
      <p
        role={pollFailed ? 'alert' : undefined}
        style={{ padding: '1rem', color: 'var(--fg-muted)' }}
      >
        {pollFailed ? DM_LIST_POLL_FAILED_COPY : 'No conversations yet.'}
      </p>
    );
  }
  return (
    <>
      {pollFailed ? (
        <p role="alert" style={panelStyle}>
          {DM_LIST_POLL_FAILED_COPY} Showing the last known list.
        </p>
      ) : null}
      <p role="note" style={panelStyle}>
        {requiredConversationDisclosure('E2EE_V1')}
      </p>
      {conversations.map((conversation) => {
        const other = conversation.members.find((m) => m.actor?.id !== viewerActorId)?.actor;
        // Mode labels are facts read off the wire (`security_mode`, ADR 0020 §11) —
        // the panel above stays neutral because the list mixes states.
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
    </>
  );
}

/** The E2EE-state panel: what this browser can and cannot do right now, honestly. */
export function E2eePanel({
  status,
  enrolling,
  onEnroll,
  onWipe,
}: {
  status: ReturnType<typeof useE2ee>;
  enrolling: boolean;
  onEnroll: () => void;
  onWipe: () => void;
}): JSX.Element | null {
  if (status.kind === 'signed-out' || status.kind === 'loading') return null;
  if (status.kind === 'fault') {
    return (
      <div role="alert" style={panelStyle}>
        <p>{status.copy}</p>
        <button type="button" onClick={onWipe} style={buttonStyle}>
          Reset encrypted messages on this device
        </button>
      </div>
    );
  }
  if (status.kind === 'not-enrolled' || status.kind === 'refused') {
    const refusal = status.kind === 'refused' ? <p>{status.copy}</p> : null;
    return (
      <div role="note" style={panelStyle}>
        <p>
          {requiredConversationDisclosure('E2EE_V1')} {WEB_E2EE_COPY.notEnrolled}
        </p>
        {refusal}
        <button
          type="button"
          onClick={onEnroll}
          disabled={enrolling}
          style={buttonStyle}
          aria-label="Enroll this browser as a messaging device"
        >
          {/* Not "enable encrypted messages": enrolling registers this device's keys and
              nothing more — it does not make messaging work here (B-132). */}
          {enrolling ? 'Enrolling…' : 'Enroll this browser as a messaging device'}
        </button>
      </div>
    );
  }
  if (status.kind === 'enrolling') {
    return (
      <div role="note" style={panelStyle}>
        <p>Enrolling this browser as a messaging device…</p>
      </div>
    );
  }
  return (
    <div role="note" style={panelStyle}>
      <p>{requiredConversationDisclosure('E2EE_V1')} This browser holds its own device keys.</p>
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import type { JSX } from 'react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { api } from '../api/client.js';
import { securityModeLabel } from '../components/DmNotice.js';
import { PlusIcon } from '../components/icons/Icons.js';
import { requiredConversationDisclosure } from '@patches/domain';
import { useSession } from '../hooks/useSession.js';
import { formatRelativeTime } from '../lib/format.js';
import {
  WEB_E2EE_SESSION_UNAVAILABLE_COPY,
  webE2eeSessionSetupAvailable,
} from '../e2ee/availability.js';
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
 * Conversations list. Since B-095/B-096 every conversation is `E2EE_V1`, and this browser
 * can now hold its own enrolled messaging device. Enrollment is real and works; actually
 * moving messages does not yet, because no session can be established from a browser
 * (`e2ee/availability.ts`, B-132/B-124). The panel and the "New Message" control say that
 * outright rather than implying a retry would help.
 */
export function MessagesRoute(): JSX.Element {
  const session = useSession();
  const e2eeStatus = useE2ee(session);
  const [enrolling, setEnrolling] = useState(false);

  const query = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.messages.listConversations({ cursor: '', limit: 30 }),
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
    // Fails closed with fixed copy until session setup exists (availability.ts).
    try {
      await webE2ee().createConversation();
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
            disabled={!webE2eeSessionSetupAvailable()}
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
      {query.data?.conversations.length === 0 ? (
        <p style={{ padding: '1rem', color: 'var(--fg-muted)' }}>No conversations yet.</p>
      ) : null}
      {query.data?.conversations.map((conversation) => {
        const other = conversation.members.find((m) => m.actor?.id !== session?.actor.id)?.actor;
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
    </div>
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
        {webE2eeSessionSetupAvailable() ? null : <p>{WEB_E2EE_SESSION_UNAVAILABLE_COPY}</p>}
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
      <p>
        {requiredConversationDisclosure('E2EE_V1')} This browser holds its own device keys.
      </p>
      {webE2eeSessionSetupAvailable() ? null : <p>{WEB_E2EE_SESSION_UNAVAILABLE_COPY}</p>}
    </div>
  );
}

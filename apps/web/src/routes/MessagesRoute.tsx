import type { Actor } from '@patches/proto/es';
import type { JSX } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { requiredConversationDisclosure } from '@patches/domain';
import { useSession } from '../hooks/useSession.js';
import { useE2ee, useE2eeVaultAccess } from '../e2ee/use-e2ee.js';
import { webE2ee, WEB_E2EE_COPY, WebE2eeUnavailableError } from '../e2ee/web-e2ee.js';
import { NeedsAuthorityFlow } from '../components/e2ee/NeedsAuthorityFlow.js';
import flowStyles from '../components/e2ee/messagesFlow.module.css';
import { ChatShell } from '../messages/ChatShell.js';
import {
  ConversationListPane,
  DM_LIST_POLL_FAILED_COPY,
} from '../messages/ConversationListPane.js';
import {
  NewConversationPanel,
  type NewConversationPhase,
} from '../messages/NewConversationPanel.js';
import { useConversationsQuery } from '../messages/useConversationsQuery.js';

export { DM_LIST_POLL_FAILED_COPY };

type ComposeState = { readonly phase: 'closed' } | NewConversationPhase;

/**
 * `/messages` — the chat shell (#321): conversation list on the left/top, and the invitation
 * to pick someone (or, once picked, the opening-message composer) on the right/detail pane.
 * Enrollment/needs-authority states render as an inline banner above the shell, never a
 * separate page or popup.
 */
export function MessagesRoute(): JSX.Element {
  const session = useSession();
  const e2eeStatus = useE2ee(session);
  const [enrolling, setEnrolling] = useState(false);
  const [needsAuthority, setNeedsAuthority] = useState(false);
  const [compose, setCompose] = useState<ComposeState>({ phase: 'closed' });
  const [sendingCompose, setSendingCompose] = useState(false);
  const [composeFailed, setComposeFailed] = useState(false);
  const navigate = useNavigate();
  const actorId = session?.actor.id;
  const deviceLinkVault = useE2eeVaultAccess(e2eeStatus);

  const query = useConversationsQuery();

  async function handleEnroll(): Promise<void> {
    setEnrolling(true);
    try {
      const outcome = await webE2ee().enroll();
      if (outcome.status === 'enrolled') {
        toast(WEB_E2EE_COPY.peerWarning);
      } else if (outcome.status === 'needs-authority') {
        setNeedsAuthority(true);
      } else if (outcome.status === 'refused') {
        toast.error(outcome.copy);
      }
    } catch (error) {
      toast.error(
        error instanceof WebE2eeUnavailableError ? error.message : WEB_E2EE_COPY.enrollFailed,
      );
    } finally {
      setEnrolling(false);
    }
  }

  async function handleNeedsAuthorityResolved(resolution: 'enrolled' | 'cancelled'): Promise<void> {
    setNeedsAuthority(false);
    if (resolution !== 'enrolled' || actorId === undefined) return;
    await webE2ee().reloadEnrollment();
  }

  function handleRecipientSelected(recipient: Actor): void {
    setComposeFailed(false);
    setCompose({ phase: 'message', recipient });
  }

  async function handleSendCompose(body: string): Promise<void> {
    if (compose.phase !== 'message') return;
    setSendingCompose(true);
    setComposeFailed(false);
    try {
      const conversationId = await webE2ee().createConversation([compose.recipient.id], body);
      setCompose({ phase: 'closed' });
      void navigate(`/messages/${conversationId}`);
    } catch (error) {
      setComposeFailed(true);
      toast(error instanceof WebE2eeUnavailableError ? error.message : WEB_E2EE_COPY.sendFailed);
    } finally {
      setSendingCompose(false);
    }
  }

  return (
    <div>
      {needsAuthority &&
      actorId !== undefined &&
      deviceLinkVault.vault !== undefined &&
      deviceLinkVault.transport !== undefined ? (
        <NeedsAuthorityFlow
          actorId={actorId}
          vault={deviceLinkVault.vault}
          transport={deviceLinkVault.transport}
          onResolved={(resolution) => void handleNeedsAuthorityResolved(resolution)}
        />
      ) : needsAuthority ? (
        <p
          role="status"
          className={`${flowStyles['card']} ${flowStyles['inline']} ${flowStyles['note']}`}
        >
          Preparing…
        </p>
      ) : (
        <E2eePanel
          status={e2eeStatus}
          enrolling={enrolling}
          onEnroll={() => void handleEnroll()}
          onWipe={() => void webE2ee().wipe()}
        />
      )}

      <ChatShell
        mobilePane={compose.phase === 'closed' ? 'list' : 'detail'}
        detailTitle="Messages"
        list={
          <ConversationListPane
            conversations={query.data?.conversations}
            viewerActorId={actorId}
            isPending={query.isPending}
            pollFailed={query.isError}
            canCompose={e2eeStatus.kind === 'enrolled'}
            onNewMessage={() => setCompose({ phase: 'pick' })}
          />
        }
        detail={
          compose.phase === 'closed' || actorId === undefined ? (
            <p style={{ margin: 'auto', color: 'var(--fg-muted)' }}>
              Select a conversation, or start a new one.
            </p>
          ) : (
            <NewConversationPanel
              state={compose}
              viewerActorId={actorId}
              sending={sendingCompose}
              failed={composeFailed}
              onRecipientSelected={handleRecipientSelected}
              onSend={(body) => void handleSendCompose(body)}
              onCancel={() => setCompose({ phase: 'closed' })}
            />
          )
        }
      />
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
      <div role="alert" className={`${flowStyles['card']} ${flowStyles['inline']}`}>
        <p className={flowStyles['alertText']}>{status.copy}</p>
        <button
          type="button"
          className={`${flowStyles['optionButton']} ${flowStyles['danger']}`}
          onClick={onWipe}
        >
          Reset encrypted messages on this device
        </button>
      </div>
    );
  }
  if (status.kind === 'not-enrolled' || status.kind === 'refused') {
    const refusal =
      status.kind === 'refused' ? <p className={flowStyles['note']}>{status.copy}</p> : null;
    return (
      <div role="note" className={`${flowStyles['card']} ${flowStyles['inline']}`}>
        <p className={flowStyles['explanation']}>
          {requiredConversationDisclosure('E2EE_V1')} {WEB_E2EE_COPY.notEnrolled}
        </p>
        {refusal}
        {/* Not "enable encrypted messages": enrolling registers this device's keys and
            nothing more — it does not make messaging work here (B-132). */}
        <button
          type="button"
          className={`${flowStyles['optionButton']} ${flowStyles['primary']}`}
          onClick={onEnroll}
          disabled={enrolling}
          aria-label="Enroll this browser as a messaging device"
        >
          {enrolling ? 'Enrolling…' : 'Enroll this browser as a messaging device'}
        </button>
      </div>
    );
  }
  if (status.kind === 'enrolling') {
    return (
      <div
        role="note"
        className={`${flowStyles['card']} ${flowStyles['inline']} ${flowStyles['note']}`}
      >
        <p>Enrolling this browser as a messaging device…</p>
      </div>
    );
  }
  return (
    <div
      role="note"
      className={`${flowStyles['card']} ${flowStyles['inline']} ${flowStyles['note']}`}
    >
      <p>{requiredConversationDisclosure('E2EE_V1')} This browser holds its own device keys.</p>
    </div>
  );
}

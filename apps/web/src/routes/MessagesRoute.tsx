import type { Actor } from '@patches/proto/es';
import { useQuery } from '@tanstack/react-query';
import type { JSX } from 'react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { api } from '../api/client.js';
import { requiredConversationDisclosure } from '@patches/domain';
import { useSession } from '../hooks/useSession.js';
import { useE2ee, useE2eeVaultAccess } from '../e2ee/use-e2ee.js';
import { webE2ee, WEB_E2EE_COPY, WebE2eeUnavailableError } from '../e2ee/web-e2ee.js';
import { NeedsAuthorityFlow } from '../components/e2ee/NeedsAuthorityFlow.js';
import { ComposeIcon } from '../components/icons/Icons.js';
import {
  Button,
  ButtonGroup,
  DeviceKeyIllustration,
  EmptyState,
  Panel,
  SelectConversationIllustration,
} from '../components/ui/index.js';
import { ChatShell } from '../messages/ChatShell.js';
import { E2eeStatusChip } from '../messages/E2eeStatusChip.js';
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
  const [composeError, setComposeError] = useState<string | undefined>(undefined);
  const navigate = useNavigate();
  const actorId = session?.actor.id;
  const deviceLinkVault = useE2eeVaultAccess(e2eeStatus);
  const [searchParams, setSearchParams] = useSearchParams();
  const toHandle = searchParams.get('to') ?? '';

  // #323: `/messages?to=<handle>` is the profile "Message" button's entry point — it opens
  // exactly the compose flow the in-list picker opens, rather than a second code path that
  // can rot on its own. The handle is resolved to an actor here because everything
  // downstream (`createConversation`, the availability probe) is id-addressed.
  const recipientQuery = useQuery({
    queryKey: ['actor-by-handle', toHandle],
    queryFn: () => api.actors.getActorByHandle({ handle: toHandle }),
    enabled: toHandle !== '',
  });
  const linkedRecipient = recipientQuery.data?.actor;
  // Adjusted during render on a changed value rather than in an effect — React's documented
  // pattern, and the same one `useE2eeVaultAccess` uses; `react-hooks/set-state-in-effect`
  // rejects the effect form. Only ever opens a *closed* panel, so a user who cancelled
  // (which also drops `?to=`) or who already started typing is never reset under them.
  const [lastLinkedRecipient, setLastLinkedRecipient] = useState(linkedRecipient);
  if (linkedRecipient !== lastLinkedRecipient) {
    setLastLinkedRecipient(linkedRecipient);
    if (linkedRecipient !== undefined && compose.phase === 'closed') {
      setCompose({ phase: 'message', recipient: linkedRecipient });
    }
  }

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
    setComposeError(undefined);
    setCompose({ phase: 'message', recipient });
  }

  function handleComposeClosed(): void {
    setCompose({ phase: 'closed' });
    // Drops `?to=` so the render-time adjustment above cannot reopen the panel the user just
    // dismissed, and so a reload of this URL is a plain conversation list.
    if (toHandle !== '') setSearchParams({}, { replace: true });
  }

  async function handleSendCompose(body: string): Promise<void> {
    if (compose.phase !== 'message') return;
    setSendingCompose(true);
    setComposeError(undefined);
    try {
      const conversationId = await webE2ee().createConversation([compose.recipient.id], body);
      handleComposeClosed();
      void navigate(`/messages/${conversationId}`);
    } catch (error) {
      // `createConversation` already names the node's refusal code and logs it structurally;
      // an alert-role line keeps it on screen instead of in a toast that scrolls away (#320).
      setComposeError(
        error instanceof WebE2eeUnavailableError ? error.message : WEB_E2EE_COPY.sendFailed,
      );
    } finally {
      setSendingCompose(false);
    }
  }

  const enrolled = e2eeStatus.kind === 'enrolled';
  const showNeedsAuthority = needsAuthority && actorId !== undefined;
  // Stacked layouts show one pane at a time. When this browser has no device keys the only
  // thing worth showing is the detail pane's `E2eePanel`: it owns the enrol/refused/fault
  // states, and the list behind it can only ever be empty. Showing the list first would
  // strand a phone with no reachable way to enrol at all. `loading`/`signed-out` stay on the
  // list so a resolving session does not flash the detail pane on the way to it.
  const deviceNeedsAttention =
    e2eeStatus.kind === 'not-enrolled' ||
    e2eeStatus.kind === 'refused' ||
    e2eeStatus.kind === 'fault' ||
    e2eeStatus.kind === 'enrolling';
  const mobilePane =
    compose.phase !== 'closed' || showNeedsAuthority || deviceNeedsAttention ? 'detail' : 'list';

  return (
    <ChatShell
      title="Messages"
      mobilePane={mobilePane}
      statusChip={<E2eeStatusChip status={e2eeStatus} />}
      action={
        enrolled ? (
          <Button
            variant="primary"
            iconOnly
            icon={<ComposeIcon size={18} />}
            aria-label="New direct message"
            onClick={() => setCompose({ phase: 'pick' })}
          />
        ) : undefined
      }
      list={
        <ConversationListPane
          conversations={query.data?.conversations}
          viewerActorId={actorId}
          isPending={query.isPending}
          pollFailed={query.isError}
          canCompose={enrolled}
          onNewMessage={() => setCompose({ phase: 'pick' })}
        />
      }
      detail={
        showNeedsAuthority ? (
          deviceLinkVault.vault !== undefined && deviceLinkVault.transport !== undefined ? (
            <NeedsAuthorityFlow
              actorId={actorId}
              vault={deviceLinkVault.vault}
              transport={deviceLinkVault.transport}
              onResolved={(resolution) => void handleNeedsAuthorityResolved(resolution)}
            />
          ) : (
            <Panel centered role="status" title="Preparing…" />
          )
        ) : compose.phase !== 'closed' && actorId !== undefined ? (
          <NewConversationPanel
            state={compose}
            viewerActorId={actorId}
            sending={sendingCompose}
            error={composeError}
            onRecipientSelected={handleRecipientSelected}
            onSend={(body) => void handleSendCompose(body)}
            onCancel={handleComposeClosed}
          />
        ) : (
          <E2eePanel
            status={e2eeStatus}
            enrolling={enrolling}
            onEnroll={() => void handleEnroll()}
            onWipe={() => void webE2ee().wipe()}
          />
        )
      }
    />
  );
}

/**
 * The thread pane when no conversation is open: what this browser can and cannot do right
 * now, honestly, as an inline panel rather than a card dropped over the layout.
 */
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
  if (status.kind === 'fault') {
    return (
      <Panel
        centered
        tone="alert"
        role="alert"
        title="Messaging is unavailable on this browser"
        description={status.copy}
        footer={
          <Button variant="danger" fullWidth onClick={onWipe}>
            Reset encrypted messages on this device
          </Button>
        }
      />
    );
  }

  if (status.kind === 'not-enrolled' || status.kind === 'refused') {
    return (
      <Panel
        centered
        role="note"
        eyebrow="This device"
        title="Set up messaging on this browser"
        description={`${requiredConversationDisclosure('E2EE_V1')} ${WEB_E2EE_COPY.notEnrolled}`}
        footer={
          <ButtonGroup direction="stacked">
            {/* Not "enable encrypted messages": enrolling registers this device's keys and
                nothing more — it does not make messaging work here (B-132). */}
            <Button
              variant="primary"
              fullWidth
              loading={enrolling}
              onClick={onEnroll}
              aria-label="Enroll this browser as a messaging device"
            >
              {enrolling ? 'Enrolling…' : 'Enroll this browser as a messaging device'}
            </Button>
          </ButtonGroup>
        }
      >
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <DeviceKeyIllustration size={88} />
        </div>
        {status.kind === 'refused' ? <p>{status.copy}</p> : null}
      </Panel>
    );
  }

  if (status.kind === 'enrolling') {
    return <Panel centered role="status" title="Enrolling this browser as a messaging device…" />;
  }

  return (
    <EmptyState
      illustration={<SelectConversationIllustration />}
      title="Select a conversation"
      description="Pick a thread on the left, or start a new one. This node sees who you message and when — never what you say."
    />
  );
}

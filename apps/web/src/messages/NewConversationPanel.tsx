import type { Actor } from '@patches/proto/es';
import { useQuery } from '@tanstack/react-query';
import { type JSX, useState } from 'react';

import {
  Avatar,
  Button,
  EmptyState,
  SelectConversationIllustration,
} from '../components/ui/index.js';
import {
  checkRecipientAvailability,
  describeRecipientAvailability,
} from '../e2ee/recipient-availability.js';
import { Composer } from './Composer.js';
import { PeoplePicker } from './PeoplePicker.js';
import styles from './NewConversationPanel.module.css';

export type NewConversationPhase =
  { readonly phase: 'pick' } | { readonly phase: 'message'; readonly recipient: Actor };

export interface NewConversationPanelProps {
  readonly state: NewConversationPhase;
  readonly viewerActorId: string;
  readonly sending: boolean;
  /** Inline refusal copy for the last send attempt, kept on screen instead of in a toast
   * that scrolls away (#320). */
  readonly error: string | undefined;
  readonly onRecipientSelected: (actor: Actor) => void;
  readonly onSend: (body: string) => void;
  readonly onCancel: () => void;
}

/**
 * #321/#322: the inline "who do you want to message" -> "write the opening message" flow —
 * no popup, one shared picker/composer with the rest of the chat shell. Selecting an actor
 * either opens their existing thread (handled by the caller before this even mounts a
 * `'message'` phase) or, for a genuinely new recipient, moves straight to writing the first
 * message; sending it is what actually reserves the conversation (`webE2ee().createConversation`).
 */
export function NewConversationPanel({
  state,
  viewerActorId,
  sending,
  error,
  onRecipientSelected,
  onSend,
  onCancel,
}: NewConversationPanelProps): JSX.Element {
  if (state.phase === 'pick') {
    return (
      <div className={styles['pane']} role="group" aria-label="New message">
        <div className={styles['header']}>
          <h2 className={styles['heading']}>New message</h2>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
        <PeoplePicker
          viewerActorId={viewerActorId}
          excludeActorIds={[viewerActorId]}
          onSelect={onRecipientSelected}
        />
      </div>
    );
  }

  return (
    <ComposeMessagePanel
      recipient={state.recipient}
      sending={sending}
      error={error}
      onSend={onSend}
      onCancel={onCancel}
    />
  );
}

/**
 * The opening-message step, split out so the recipient-availability probe (#320) is a plain
 * unconditional hook on a component that only exists once a recipient is chosen.
 *
 * The probe is what turns the node's uniform `not_found` refusal into something actionable:
 * §183.2 gates a first conversation on a mutual follow, and two enrolled accounts that don't
 * follow each other back were the whole owner-reported P0. It reads only what the viewer can
 * already see about their own edges — see `recipient-availability.ts` for why that is not a
 * new oracle.
 */
function ComposeMessagePanel({
  recipient,
  sending,
  error,
  onSend,
  onCancel,
}: {
  recipient: Actor;
  sending: boolean;
  error: string | undefined;
  onSend: (body: string) => void;
  onCancel: () => void;
}): JSX.Element {
  const [lastAttempt, setLastAttempt] = useState('');
  const availabilityQuery = useQuery({
    queryKey: ['recipient-availability', recipient.id],
    queryFn: () => checkRecipientAvailability(recipient.id),
  });
  const availability = availabilityQuery.data ?? { kind: 'unknown' as const };
  const blockedReason = describeRecipientAvailability(availability, recipient.handle);

  return (
    <div className={styles['pane']} role="group" aria-label="New message">
      <div className={styles['header']}>
        <Avatar name={recipient.displayName || recipient.handle} src={recipient.avatar?.url} />
        <h2 className={styles['heading']}>Message @{recipient.handle}</h2>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {blockedReason === undefined && error === undefined ? null : (
        <div className={styles['notices']}>
          {blockedReason === undefined ? null : (
            <p role="note" className={styles['notice']}>
              {blockedReason}
            </p>
          )}
          {error === undefined ? null : (
            <div role="alert" className={`${styles['notice']} ${styles['error']}`}>
              <span>{error}</span>
              {lastAttempt === '' ? null : (
                <Button variant="danger" size="sm" onClick={() => onSend(lastAttempt)}>
                  Retry
                </Button>
              )}
            </div>
          )}
        </div>
      )}
      <div className={styles['spacer']}>
        <EmptyState
          compact
          illustration={<SelectConversationIllustration size={96} />}
          title={`Say hello to @${recipient.handle}`}
          description="Your first message opens the conversation. It is sealed on this device before it leaves."
        />
      </div>
      {/* The refusal is stated once, above, with its own retry — the composer's generic
          "failed" row would only repeat it less precisely. */}
      <Composer
        status={sending ? 'sending' : undefined}
        // A probe that could not answer (`unknown`) never blocks the attempt — the node is
        // still the authority, and a probe outage must not become a second refusal.
        disabled={blockedReason !== undefined}
        onSend={(body) => {
          setLastAttempt(body);
          onSend(body);
        }}
      />
    </div>
  );
}

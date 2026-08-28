import type { Actor } from '@patches/proto/es';
import { type JSX, useState } from 'react';

import { Composer } from './Composer.js';
import { PeoplePicker } from './PeoplePicker.js';
import flowStyles from '../components/e2ee/messagesFlow.module.css';

export type NewConversationPhase =
  { readonly phase: 'pick' } | { readonly phase: 'message'; readonly recipient: Actor };

export interface NewConversationPanelProps {
  readonly state: NewConversationPhase;
  readonly viewerActorId: string;
  readonly sending: boolean;
  readonly failed: boolean;
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
  failed,
  onRecipientSelected,
  onSend,
  onCancel,
}: NewConversationPanelProps): JSX.Element {
  const [lastAttempt, setLastAttempt] = useState('');

  if (state.phase === 'pick') {
    return (
      <div role="group" aria-label="New message">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.75rem 0.75rem 0',
          }}
        >
          <h2 className={flowStyles['title']}>New message</h2>
          <button
            type="button"
            className={`${flowStyles['optionButton']} ${flowStyles['tertiary']}`}
            onClick={onCancel}
          >
            Cancel
          </button>
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
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
      role="group"
      aria-label="New message"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1rem',
        }}
      >
        <h2 className={flowStyles['title']}>Message @{state.recipient.handle}</h2>
        <button
          type="button"
          className={`${flowStyles['optionButton']} ${flowStyles['tertiary']}`}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
      <div style={{ flex: 1 }} />
      <Composer
        status={sending ? 'sending' : failed ? 'failed' : undefined}
        onSend={(body) => {
          setLastAttempt(body);
          onSend(body);
        }}
        onRetry={() => onSend(lastAttempt)}
      />
    </div>
  );
}

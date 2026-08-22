import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '../api/client.js';
import { useErrorToast } from '../hooks/useErrorToast.js';
import { CloseIcon } from './icons/Icons.js';
import { useToast } from './ToastProvider.js';
import styles from './NewMessageDialog.module.css';

export interface NewMessageDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialRecipient?:
    | {
        id: string;
        handle: string;
        displayName?: string | undefined;
        avatarUrl?: string | undefined;
      }
    | undefined;
}

export function NewMessageDialog({
  isOpen,
  onClose,
  initialRecipient,
}: NewMessageDialogProps): JSX.Element | null {
  const navigate = useNavigate();
  const onError = useErrorToast();
  const toast = useToast();

  const [handleInput, setHandleInput] = useState(initialRecipient?.handle ?? '');
  const [body, setBody] = useState('');

  const cleanHandle = handleInput.trim().replace(/^@/, '');

  const actorQuery = useQuery({
    queryKey: ['actor', 'by-handle', cleanHandle],
    queryFn: () => api.actors.getActorByHandle({ handle: cleanHandle }),
    enabled: isOpen && !initialRecipient && cleanHandle.length >= 2,
    retry: false,
  });

  const recipient =
    initialRecipient ??
    (actorQuery.data?.actor
      ? {
          id: actorQuery.data.actor.id,
          handle: actorQuery.data.actor.handle,
          displayName: actorQuery.data.actor.displayName,
          avatarUrl: actorQuery.data.actor.avatar?.url,
        }
      : null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!recipient) throw new Error('Recipient not found');
      return await api.messages.createConversation({
        clientRequestId: crypto.randomUUID(),
        recipientActorIds: [recipient.id],
        initialBody: body.trim(),
      });
    },
    onSuccess: (res) => {
      onClose();
      if (res.conversation?.id) {
        void navigate(`/messages/${res.conversation.id}`);
      } else {
        toast.pushToast({ message: 'Message request sent', tone: 'info' });
        void navigate('/messages');
      }
    },
    onError: (err) => onError(err),
  });

  if (!isOpen) return null;

  return (
    <div
      className={styles['overlay']}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="New Message"
    >
      <div className={styles['dialog']} onClick={(e) => e.stopPropagation()}>
        <div className={styles['header']}>
          <span className={styles['title']}>New Direct Message</span>
          <button type="button" className={styles['closeBtn']} onClick={onClose} aria-label="Close">
            <CloseIcon size={18} />
          </button>
        </div>

        <form
          className={styles['body']}
          onSubmit={(e) => {
            e.preventDefault();
            if (recipient && body.trim() && !mutation.isPending) {
              mutation.mutate();
            }
          }}
        >
          <div className={styles['field']}>
            <label htmlFor="dm-recipient-input" className={styles['label']}>
              To (@handle)
            </label>
            {initialRecipient ? (
              <div className={styles['actorFoundCard']}>
                {initialRecipient.avatarUrl ? (
                  <img
                    src={initialRecipient.avatarUrl}
                    alt=""
                    className={styles['actorFoundAvatar']}
                  />
                ) : (
                  <div className={styles['actorFoundPlaceholder']}>
                    {initialRecipient.handle.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className={styles['actorFoundInfo']}>
                  <span className={styles['actorFoundName']}>
                    {initialRecipient.displayName || initialRecipient.handle}
                  </span>
                  <span className={styles['actorFoundHandle']}>@{initialRecipient.handle}</span>
                </div>
              </div>
            ) : (
              <>
                <input
                  id="dm-recipient-input"
                  className={styles['input']}
                  placeholder="e.g. violet"
                  value={handleInput}
                  onChange={(e) => setHandleInput(e.target.value)}
                  autoFocus
                />
                {actorQuery.data?.actor ? (
                  <div className={styles['actorFoundCard']}>
                    {actorQuery.data.actor.avatar?.url ? (
                      <img
                        src={actorQuery.data.actor.avatar.url}
                        alt=""
                        className={styles['actorFoundAvatar']}
                      />
                    ) : (
                      <div className={styles['actorFoundPlaceholder']}>
                        {actorQuery.data.actor.handle.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className={styles['actorFoundInfo']}>
                      <span className={styles['actorFoundName']}>
                        {actorQuery.data.actor.displayName || actorQuery.data.actor.handle}
                      </span>
                      <span className={styles['actorFoundHandle']}>
                        @{actorQuery.data.actor.handle}
                      </span>
                    </div>
                  </div>
                ) : actorQuery.isError && cleanHandle.length >= 2 ? (
                  <span style={{ fontSize: '0.8rem', color: 'var(--danger, #f85149)' }}>
                    User @{cleanHandle} not found.
                  </span>
                ) : null}
              </>
            )}
          </div>

          <div className={styles['field']}>
            <label htmlFor="dm-body-input" className={styles['label']}>
              Message
            </label>
            <textarea
              id="dm-body-input"
              className={styles['textarea']}
              placeholder="Write your message…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
            />
          </div>

          <div className={styles['footer']}>
            <button type="button" className={styles['cancelBtn']} onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className={styles['sendBtn']}
              disabled={!recipient || !body.trim() || mutation.isPending}
            >
              {mutation.isPending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

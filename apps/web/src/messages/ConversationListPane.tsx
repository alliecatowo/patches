import type { JSX } from 'react';
import { Link } from 'react-router-dom';

import type { api } from '../api/client.js';
import { securityModeLabel } from '../components/DmNotice.js';
import { PlusIcon } from '../components/icons/Icons.js';
import { formatRelativeTime } from '../lib/format.js';
import styles from './ConversationListPane.module.css';

type ConversationsResult = Awaited<ReturnType<typeof api.messages.listConversations>>;
export type ConversationRow = ConversationsResult['conversations'][number];

/**
 * P19-017: extends this client's poll-failure house rule to the conversation list — nothing
 * about a failed `ListConversations` poll may be mistaken for a genuinely empty inbox.
 */
export const DM_LIST_POLL_FAILED_COPY = 'Could not load conversations.';

/**
 * List-level panel copy. Must hold regardless of any individual row's `security_mode` — the
 * list can mix `E2EE_V1` and `LEGACY_SERVER_VISIBLE` conversations (ADR 0020 §11), so a
 * blanket disclosure here would assert encryption for rows that don't have it (spec
 * §183.1/§194). Each row's own `securityModeLabel` is the only per-conversation truth stated.
 */
export const CONVERSATION_LIST_NEUTRAL_NOTE =
  'Each conversation below shows its own security mode. This node always sees who you message and when.';

export interface ConversationListPaneProps {
  readonly conversations: readonly ConversationRow[] | undefined;
  readonly viewerActorId: string | undefined;
  readonly isPending: boolean;
  readonly pollFailed: boolean;
  readonly activeConversationId?: string;
  readonly canCompose: boolean;
  readonly onNewMessage: () => void;
}

/**
 * #321: the conversation list pane — avatar, display name, relative time, unread badge, and
 * the §183.1 disclosure as one unit (structurally impossible to render a row without the
 * neutral note above it). Since v0 DMs are server-side E2EE, this node holds no plaintext to
 * preview (ADR 0020/0030) — the preview slot shows the conversation's own security-mode label
 * instead of fabricated message text.
 */
export function ConversationListPane({
  conversations,
  viewerActorId,
  isPending,
  pollFailed,
  activeConversationId,
  canCompose,
  onNewMessage,
}: ConversationListPaneProps): JSX.Element {
  return (
    <>
      <div className={styles['headerRow']}>
        <h1>Messages</h1>
        {canCompose ? (
          <button
            type="button"
            className={styles['newMsgBtn']}
            onClick={onNewMessage}
            aria-label="New direct message"
          >
            <PlusIcon size={16} />
            <span>New Message</span>
          </button>
        ) : null}
      </div>
      {isPending ? <p style={{ padding: '1rem' }}>Loading…</p> : null}
      {pollFailed && conversations === undefined ? (
        <p role="alert" style={{ padding: '1rem', color: 'var(--fg-muted)' }}>
          {DM_LIST_POLL_FAILED_COPY}
        </p>
      ) : null}
      {conversations === undefined ? null : conversations.length === 0 ? (
        pollFailed ? (
          <p role="alert" style={{ padding: '1rem', color: 'var(--fg-muted)' }}>
            {DM_LIST_POLL_FAILED_COPY}
          </p>
        ) : (
          <div className={styles['emptyState']}>
            <p>No conversations yet — start one.</p>
            {canCompose ? (
              <button type="button" className={styles['newMsgBtn']} onClick={onNewMessage}>
                <PlusIcon size={16} />
                <span>Start a conversation</span>
              </button>
            ) : null}
          </div>
        )
      ) : (
        <>
          {pollFailed ? (
            <p role="alert" className={styles['note']}>
              {DM_LIST_POLL_FAILED_COPY} Showing the last known list.
            </p>
          ) : null}
          <p role="note" className={styles['note']}>
            {CONVERSATION_LIST_NEUTRAL_NOTE}
          </p>
          {conversations.map((conversation) => {
            const other = conversation.members.find((m) => m.actor?.id !== viewerActorId)?.actor;
            const modeLabel = securityModeLabel(conversation.securityMode);
            const unread = conversation.unreadCount > 0;
            const name = other?.displayName || other?.handle || 'conversation';
            return (
              <Link
                key={conversation.id}
                to={`/messages/${conversation.id}`}
                className={`${styles['row']} ${conversation.id === activeConversationId ? styles['rowActive'] : ''}`}
              >
                {other?.avatar?.url ? (
                  <img
                    className={styles['avatar']}
                    src={other.avatar.url}
                    alt=""
                    aria-hidden="true"
                  />
                ) : (
                  <span className={styles['avatarPlaceholder']} aria-hidden="true">
                    {name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className={styles['rowBody']}>
                  <span className={styles['rowTop']}>
                    <span className={`${styles['name']} ${unread ? styles['unreadName'] : ''}`}>
                      @{other?.handle ?? 'conversation'}
                    </span>
                    <span className={styles['time']}>
                      {formatRelativeTime(conversation.lastMessageAt)}
                    </span>
                  </span>
                  <span className={styles['previewRow']}>
                    <span className={styles['preview']}>{modeLabel ?? 'Conversation'}</span>
                    {unread ? (
                      <span
                        className={styles['unreadBadge']}
                        aria-label={`${conversation.unreadCount} unread`}
                      >
                        {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                      </span>
                    ) : null}
                  </span>
                </span>
              </Link>
            );
          })}
        </>
      )}
    </>
  );
}

import type { JSX } from 'react';

import type { api } from '../api/client.js';
import { securityModeLabel } from '../components/DmNotice.js';
import { ShieldIcon } from '../components/icons/Icons.js';
import {
  Avatar,
  Button,
  ConversationsIllustration,
  EmptyState,
  ListRow,
  UnreadDot,
} from '../components/ui/index.js';
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
 * #321/#336: the conversation list pane — 40px avatar, name, preview, time and an unread dot
 * per row, with the §183.1 disclosure as one unit (structurally impossible to render a row
 * without the neutral note above it). Since v0 DMs are E2EE, this node holds no plaintext to
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
  if (isPending && conversations === undefined && !pollFailed) {
    return <ConversationListSkeleton />;
  }

  if (pollFailed && (conversations === undefined || conversations.length === 0)) {
    return (
      <p role="alert" className={styles['alert']}>
        {DM_LIST_POLL_FAILED_COPY}
      </p>
    );
  }

  if (conversations === undefined) return <ConversationListSkeleton />;

  if (conversations.length === 0) {
    return (
      <EmptyState
        compact
        illustration={<ConversationsIllustration size={96} />}
        title="No conversations yet — start one."
        description="Pick someone you follow and send the first message. Nothing appears here until you do."
        action={
          canCompose ? (
            <Button variant="primary" size="md" fullWidth onClick={onNewMessage}>
              Start a conversation
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <>
      {pollFailed ? (
        <p role="alert" className={styles['alert']}>
          {DM_LIST_POLL_FAILED_COPY} Showing the last known list.
        </p>
      ) : null}
      <p role="note" className={styles['disclosure']}>
        <ShieldIcon size={13} className={styles['disclosureIcon']} aria-hidden="true" />
        <span>{CONVERSATION_LIST_NEUTRAL_NOTE}</span>
      </p>
      <div className={styles['rows']}>
        {conversations.map((conversation) => {
          const other = conversation.members.find((m) => m.actor?.id !== viewerActorId)?.actor;
          const modeLabel = securityModeLabel(conversation.securityMode);
          const unread = conversation.unreadCount > 0;
          const handle = other?.handle ?? 'conversation';
          const name = other?.displayName ?? '';
          return (
            <ListRow
              key={conversation.id}
              to={`/messages/${conversation.id}`}
              active={conversation.id === activeConversationId}
              emphasised={unread}
              leading={<Avatar name={name === '' ? handle : name} src={other?.avatar?.url} />}
              title={`@${handle}`}
              meta={formatRelativeTime(conversation.lastMessageAt)}
              subtitle={modeLabel ?? 'Conversation'}
              trailing={unread ? <UnreadDot count={conversation.unreadCount} /> : undefined}
            />
          );
        })}
      </div>
    </>
  );
}

/** Three placeholder rows in the real row geometry, so first paint does not reflow. */
function ConversationListSkeleton(): JSX.Element {
  return (
    <div aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <div key={index} className={styles['skeletonRow']}>
          <div className={`${styles['skeletonAvatar']} skeleton-shimmer`} />
          <div className={styles['skeletonLines']}>
            <div
              className={`${styles['skeletonLine']} ${styles['skeletonLineShort']} skeleton-shimmer`}
            />
            <div
              className={`${styles['skeletonLine']} ${styles['skeletonLineLong']} skeleton-shimmer`}
            />
          </div>
        </div>
      ))}
      <span className="visually-hidden">Loading conversations…</span>
    </div>
  );
}

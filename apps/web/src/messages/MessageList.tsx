import { type JSX, useEffect, useRef, useState } from 'react';

import { ConversationsIllustration, EmptyState } from '../components/ui/index.js';
import type { InboxRow } from '../e2ee/runtime.js';
import styles from './MessageList.module.css';

export interface MessageListProps {
  readonly rows: readonly InboxRow[];
  /** Snapshot of `conversation.unreadCount` taken once when the thread first has rows — used
   * to place the unread divider before the last N message rows. It is a one-time snapshot, not
   * re-derived per poll: v0's `InboxRow`s carry no wire timestamp/read-cursor (only a dedupe
   * id, `runtime.ts`), so there is no per-message read state to recompute against later polls.
   */
  readonly initialUnreadCount: number;
  readonly emptyLabel?: string;
}

interface RenderGroup {
  readonly key: string;
  readonly mine: boolean;
  readonly senderLabel: string;
  readonly rows: readonly InboxRow[];
}

/**
 * Groups adjacent rows from the same sender into one visual cluster (spec: "grouped by sender
 * + minute"). `InboxRow` (`e2ee/runtime.ts`) carries no wire timestamp today — only an opaque
 * dedupe id — so grouping here is by sender adjacency only; per-message timestamps and day
 * separators need that field threaded through the decrypt pipeline first (tracked as a
 * follow-up, out of scope here since that pipeline lives in the E2EE module another change
 * owns).
 */
function groupRows(rows: readonly InboxRow[]): RenderGroup[] {
  const groups: RenderGroup[] = [];
  for (const row of rows) {
    const mine = row.kind === 'message' && row.sentByViewer;
    const senderLabel = row.kind === 'message' ? row.senderLabel : '';
    const last = groups[groups.length - 1];
    if (
      last !== undefined &&
      row.kind === 'message' &&
      last.rows[0]?.kind === 'message' &&
      last.mine === mine &&
      last.senderLabel === senderLabel
    ) {
      groups[groups.length - 1] = { ...last, rows: [...last.rows, row] };
    } else {
      groups.push({ key: row.id, mine, senderLabel, rows: [row] });
    }
  }
  return groups;
}

export function MessageList({
  rows,
  initialUnreadCount,
  emptyLabel,
}: MessageListProps): JSX.Element {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [pendingNew, setPendingNew] = useState(0);
  const previousLength = useRef(rows.length);
  // Snapshot `initialUnreadCount` the first time there are rows to place the divider against,
  // via React's sanctioned "adjust state during render" pattern rather than an effect (an
  // effect would cost an extra render pass for something that only ever needs to happen once).
  const [unreadSnapshot, setUnreadSnapshot] = useState<number | undefined>(undefined);
  if (unreadSnapshot === undefined && rows.length > 0) setUnreadSnapshot(initialUnreadCount);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el === null) return;
    const grew = rows.length > previousLength.current;
    previousLength.current = rows.length;
    if (!grew) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) {
      el.scrollTop = el.scrollHeight;
    } else {
      setPendingNew((count) => count + 1);
    }
  }, [rows.length]);

  useEffect(() => {
    // First mount: jump straight to the bottom, no smooth-scroll surprise.
    const el = scrollerRef.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, []);

  const groups = groupRows(rows);
  const dividerIndex =
    unreadSnapshot !== undefined && unreadSnapshot > 0
      ? Math.max(0, groups.length - unreadSnapshot)
      : -1;

  if (rows.length === 0) {
    return (
      <div className={styles['scroller']} role="log" aria-label="Messages" aria-live="polite">
        <EmptyState
          compact
          illustration={<ConversationsIllustration size={88} />}
          title={emptyLabel ?? 'No messages yet.'}
          description="Anything you send is sealed on this device before it leaves it."
        />
      </div>
    );
  }

  return (
    <div
      className={styles['scroller']}
      ref={scrollerRef}
      role="log"
      aria-label="Messages"
      aria-live="polite"
    >
      {groups.map((group, index) => (
        <div key={group.key}>
          {index === dividerIndex ? (
            <div className={styles['unreadDivider']} role="separator" aria-label="Unread messages">
              Unread
            </div>
          ) : null}
          <MessageGroup group={group} />
        </div>
      ))}
      {pendingNew > 0 ? (
        <button
          type="button"
          className={styles['newMessagesPill']}
          onClick={() => {
            const el = scrollerRef.current;
            if (el !== null) el.scrollTop = el.scrollHeight;
            setPendingNew(0);
          }}
        >
          {pendingNew} new message{pendingNew === 1 ? '' : 's'}
        </button>
      ) : null}
    </div>
  );
}

function MessageGroup({ group }: { group: RenderGroup }): JSX.Element {
  if (group.rows[0]?.kind !== 'message') {
    return (
      <>
        {group.rows.map((row) => (
          <NonMessageRow key={row.id} row={row} />
        ))}
      </>
    );
  }
  const lastIndex = group.rows.length - 1;
  return (
    <div className={`${styles['group']} ${group.mine ? styles['groupMine'] : ''}`}>
      {!group.mine ? <p className={styles['groupLabel']}>{group.senderLabel}</p> : null}
      {group.rows.map((row, index) =>
        row.kind === 'message' ? (
          <p
            key={row.id}
            className={[
              styles['bubble'],
              group.mine ? styles['mine'] : styles['theirs'],
              index === 0 ? styles['first'] : '',
              index === lastIndex ? styles['last'] : '',
            ]
              .filter((name) => name !== '')
              .join(' ')}
          >
            {row.body}
          </p>
        ) : null,
      )}
    </div>
  );
}

function NonMessageRow({ row }: { row: InboxRow }): JSX.Element {
  if (row.kind === 'unverifiable') {
    return (
      <div className={styles['systemRow']}>
        <p>A message from {row.senderLabel} could not be verified and is not shown.</p>
      </div>
    );
  }
  if (row.kind === 'history') {
    return (
      <div className={styles['systemRow']}>
        <p>History re-delivered by {row.fromLabel}:</p>
        {row.entries.map((entry, index) => (
          <p key={index}>
            {entry.senderLabel}: {entry.body}
          </p>
        ))}
      </div>
    );
  }
  return (
    <div className={styles['systemRow']}>
      <p>This message cannot be displayed on this device.</p>
    </div>
  );
}

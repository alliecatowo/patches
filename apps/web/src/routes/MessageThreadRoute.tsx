import { useQuery } from '@tanstack/react-query';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { api } from '../api/client.js';
import { ConversationSecurityMode } from '@patches/proto/es';
import { requiredConversationDisclosure } from '@patches/domain';
import type { InboxRow } from '../e2ee/runtime.js';
import { useE2ee } from '../e2ee/use-e2ee.js';
import {
  webE2ee,
  usePeerIdentityEvents,
  WEB_E2EE_COPY,
  WebE2eeUnavailableError,
} from '../e2ee/web-e2ee.js';
import { useSession } from '../hooks/useSession.js';
import { WEB_DM_POLL_MS } from '../lib/poll-intervals.js';
import styles from './MessagesRoute.module.css';
import { toast } from 'sonner';

const POLL_INTERVAL_MS = 8_000;

/**
 * `/messages/:id` — an E2EE conversation thread. The node serves only metadata
 * (`GetConversation`); bodies are decrypted in this browser through the enrolled
 * device's mailbox (`webE2ee().poll`), and sends go through the sealed-envelope fanout
 * (`webE2ee().send`). Nothing plaintext ever touches the wire here.
 *
 * The composer is live: ADR 0033 unified the identity transcripts and ADR 0035 made
 * conversation creation a reserve, so this browser can establish a real session and send.
 */
export function MessageThreadRoute(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const conversationId = id ?? '';
  const session = useSession();
  const e2eeStatus = useE2ee(session);

  const conversationQuery = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => api.messages.getConversation({ id: conversationId }),
    enabled: conversationId !== '',
    // ADR 0032 §1: thread metadata updates within 60s while the tab is focused; single
    // source of truth in `lib/poll-intervals.ts` (P19-021). `refetchIntervalInBackground`
    // stays at its TanStack Query default (`false`), which already suspends this
    // interval while the tab is hidden/unfocused (`docs/research/tanstack-query.md`).
    refetchInterval: WEB_DM_POLL_MS,
    // Re-enabled for this query only; the app-wide default in `main.tsx` stays off —
    // matches the same call in `MessagesRoute.tsx` and for the same reason.
    refetchOnWindowFocus: true,
  });
  const conversation = conversationQuery.data?.conversation;
  const securityMode = conversation?.securityMode;
  const disclosedByConversation = securityMode === ConversationSecurityMode.E2EE_V1;

  const otherMembers = conversation?.members.filter((member) => member.leftAt === undefined) ?? [];
  const identityEvents = usePeerIdentityEvents();
  // C2's verification surface: pinning makes an unproven root substitution fail closed,
  // and these banners are the honest disclosure for the two states pinning cannot remove —
  // first contact (TOFU) and a rotation that verified against the peer's previous key.
  const memberIdentityEvents = identityEvents.filter((event) =>
    otherMembers.some((member) => member.actor?.id === event.actorId),
  );

  const [rows, setRows] = useState<readonly InboxRow[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const enrolled = e2eeStatus.kind === 'enrolled';

  useEffect(() => {
    if (!enrolled || conversationId === '') return;
    let cancelled = false;
    const poll = async (): Promise<void> => {
      try {
        const fresh = await webE2ee().poll(conversationId);
        if (cancelled) return;
        // Dedupe against the rows this updater is actually given, never against a ref.
        // A `setState` updater must be pure: React may call it more than once for a single
        // update, and a version that mutated an external `seenIds` set marked every row as
        // already-seen on the first call and then dropped it on the second — the surviving
        // return value. Nothing rendered, and because `poll()` acknowledges what it drains,
        // the message was gone for good.
        setRows((previous) => {
          const seen = new Set(previous.map((row) => row.id));
          const merged = [...previous];
          for (const row of fresh) {
            if (seen.has(row.id)) continue;
            seen.add(row.id);
            merged.push(row);
          }
          return merged;
        });
        setNotice(null);
      } catch {
        if (!cancelled) setNotice(WEB_E2EE_COPY.pollFailed);
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enrolled, conversationId]);

  async function handleSend(): Promise<void> {
    const body = draft.trim();
    if (body === '' || sending) return;
    setSending(true);
    try {
      await webE2ee().send(conversationId, body);
      const local: InboxRow = {
        kind: 'message',
        id: `local-${crypto.randomUUID()}`,
        senderLabel: 'you',
        body,
        sentByViewer: true,
      };
      setRows((previous) => [...previous, local]);
      setDraft('');
    } catch (error) {
      toast.error(
        error instanceof WebE2eeUnavailableError ? error.message : WEB_E2EE_COPY.sendFailed,
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={styles['thread']}>
      {otherMembers.length === 0 ? null : (
        <p
          role="note"
          style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', color: 'var(--fg-muted)' }}
        >
          <Link to={`/messages/${conversationId}/safety`}>Verify safety number</Link>
        </p>
      )}
      {disclosedByConversation ? (
        <p
          role="note"
          style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', color: 'var(--fg-muted)' }}
        >
          {requiredConversationDisclosure('E2EE_V1')}
        </p>
      ) : null}

      {memberIdentityEvents.map((event) => (
        <p
          key={event.kind + event.actorId}
          role="note"
          style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', color: 'var(--fg-muted)' }}
        >
          {event.kind === 'first-seen'
            ? 'This is the first message to this identity on this device — it is not verified yet. ' +
              'Confirm it with them out-of-band before trusting this conversation.'
            : 'This member rotated their messaging identity. The rotation was verified against their previous key.'}
        </p>
      ))}

      {e2eeStatus.kind === 'not-enrolled' || e2eeStatus.kind === 'refused' ? (
        <div
          role="note"
          style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', color: 'var(--fg-muted)' }}
        >
          <p>
            {WEB_E2EE_COPY.notEnrolled} This browser can be enrolled as a messaging device from the
            Messages list.
          </p>
        </div>
      ) : null}
      {e2eeStatus.kind === 'fault' ? (
        <div
          role="alert"
          style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', color: 'var(--fg-muted)' }}
        >
          <p>{e2eeStatus.copy}</p>
        </div>
      ) : null}

      <div className={styles['messages']}>
        {conversationQuery.isPending && rows.length === 0 ? (
          <div className={styles['emptyThread']}>
            <p>Loading…</p>
          </div>
        ) : null}
        {!conversationQuery.isPending && otherMembers.length === 0 && rows.length === 0 ? (
          <div className={styles['emptyThread']}>
            <p>This conversation could not be loaded.</p>
          </div>
        ) : null}
        {rows.length === 0 &&
        enrolled &&
        !conversationQuery.isPending &&
        otherMembers.length > 0 ? (
          <div className={styles['emptyThread']}>
            <p>No decrypted messages yet on this device.</p>
          </div>
        ) : null}
        <MessageRows rows={rows} />
        {notice === null ? null : (
          <div className={styles['emptyThread']}>
            <p>{notice}</p>
          </div>
        )}
      </div>

      {enrolled ? (
        <form
          className={styles['composer']}
          onSubmit={(event) => {
            event.preventDefault();
            void handleSend();
          }}
        >
          <textarea
            aria-label="Message body"
            className={styles['composerInput']}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={2}
            placeholder="Write a message…"
          />
          <button
            type="submit"
            className={styles['sendBtn']}
            disabled={sending || draft.trim() === ''}
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </form>
      ) : null}
    </div>
  );
}

/**
 * The message rows. `rows` come from `webE2ee().poll()` and can arrive before
 * `conversationQuery` settles, so `securityMode` (and therefore whether the parent's
 * `disclosedByConversation` panel is on screen yet) may still be unknown here even once `rows`
 * is non-empty. Spec §183.1/§194 forbids asserting encryption that isn't confirmed, so this
 * renders only the rows themselves and never its own disclosure — it has no independent way
 * to confirm the mode, and guessing `E2EE_V1` to fill that gap is exactly the false claim the
 * rule forbids. The confirmed disclosure lives solely in the parent, once `securityMode`
 * resolves.
 */
function MessageRows({ rows }: { rows: readonly InboxRow[] }): JSX.Element | null {
  if (rows.length === 0) return null;
  return (
    <>
      {rows.map((row) => (
        <MessageRow key={row.id} row={row} />
      ))}
    </>
  );
}

function MessageRow({ row }: { row: InboxRow }): JSX.Element {
  if (row.kind === 'message') {
    return (
      <div
        className={`${styles['bubble']} ${row.sentByViewer ? styles['mine'] : styles['theirs']}`}
      >
        <span className={styles['senderHandle']}>
          {row.senderLabel === 'you' ? 'you' : row.senderLabel}
        </span>
        <p className={styles['bubbleBody']}>{row.body}</p>
      </div>
    );
  }
  if (row.kind === 'unverifiable') {
    return (
      <div style={{ padding: '0.5rem 1rem', color: 'var(--fg-muted)' }}>
        <p>A message from {row.senderLabel} could not be verified and is not shown.</p>
      </div>
    );
  }
  if (row.kind === 'history') {
    return (
      <div style={{ padding: '0.5rem 1rem', color: 'var(--fg-muted)' }}>
        <p>History re-delivered by {row.fromLabel}:</p>
        {row.entries.map((entry, index) => (
          <p key={index} style={{ margin: '0.15rem 0 0' }}>
            {entry.senderLabel}: {entry.body}
          </p>
        ))}
      </div>
    );
  }
  return (
    <div style={{ padding: '0.5rem 1rem', color: 'var(--fg-muted)' }}>
      <p>This message cannot be displayed on this device.</p>
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

import { api } from '../api/client.js';
import { ConversationSecurityMode } from '@patches/proto/es';
import { requiredConversationDisclosure } from '@patches/domain';
import {
  WEB_E2EE_SESSION_UNAVAILABLE_COPY,
  webE2eeSessionSetupAvailable,
} from '../e2ee/availability.js';
import type { InboxRow } from '../e2ee/runtime.js';
import { useE2ee } from '../e2ee/use-e2ee.js';
import { webE2ee, WEB_E2EE_COPY, WebE2eeUnavailableError } from '../e2ee/web-e2ee.js';
import { useSession } from '../hooks/useSession.js';
import { useToast } from '../components/ToastProvider.js';
import styles from './MessagesRoute.module.css';

const POLL_INTERVAL_MS = 8_000;

/**
 * `/messages/:id` — an E2EE conversation thread. The node serves only metadata
 * (`GetConversation`); bodies are decrypted in this browser through the enrolled
 * device's mailbox (`webE2ee().poll`), and sends go through the sealed-envelope fanout
 * (`webE2ee().send`). Nothing plaintext ever touches the wire here.
 *
 * The composer is gated on session setup actually being possible (`availability.ts`,
 * B-132): while it is not, send is disabled and the fixed copy says so, instead of
 * offering a control whose every press fails.
 */
export function MessageThreadRoute(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const conversationId = id ?? '';
  const session = useSession();
  const toast = useToast();
  const e2eeStatus = useE2ee(session);

  const conversationQuery = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => api.messages.getConversation({ id: conversationId }),
    enabled: conversationId !== '',
  });
  const conversation = conversationQuery.data?.conversation;
  const securityMode = conversation?.securityMode;

  const otherMembers = conversation?.members.filter((member) => member.leftAt === undefined) ?? [];

  const [rows, setRows] = useState<readonly InboxRow[]>([]);
  const seenIds = useRef(new Set<string>());
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const enrolled = e2eeStatus.kind === 'enrolled';
  const sessionSetupAvailable = webE2eeSessionSetupAvailable();

  useEffect(() => {
    if (!enrolled || conversationId === '') return;
    let cancelled = false;
    const poll = async (): Promise<void> => {
      try {
        const fresh = await webE2ee().poll(conversationId);
        if (cancelled) return;
        setRows((previous) => {
          const merged = [...previous];
          for (const row of fresh) {
            if (seenIds.current.has(row.id)) continue;
            seenIds.current.add(row.id);
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
    if (body === '' || sending || !sessionSetupAvailable) return;
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
      seenIds.current.add(local.id);
      setRows((previous) => [...previous, local]);
      setDraft('');
    } catch (error) {
      toast.pushToast({
        message:
          error instanceof WebE2eeUnavailableError ? error.message : WEB_E2EE_COPY.sendFailed,
        tone: 'error',
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={styles['thread']}>
      {securityMode === ConversationSecurityMode.E2EE_V1 ? (
        <p role="note" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', color: 'var(--fg-muted)' }}>
          {requiredConversationDisclosure('E2EE_V1')}
        </p>
      ) : null}

      {e2eeStatus.kind === 'not-enrolled' || e2eeStatus.kind === 'refused' ? (
        <div role="note" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', color: 'var(--fg-muted)' }}>
          <p>
            {WEB_E2EE_COPY.notEnrolled} This browser can be enrolled as a messaging device from
            the Messages list.
          </p>
        </div>
      ) : null}
      {sessionSetupAvailable ? null : (
        <div
          role="note"
          style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', color: 'var(--fg-muted)' }}
        >
          <p>{WEB_E2EE_SESSION_UNAVAILABLE_COPY}</p>
        </div>
      )}
      {e2eeStatus.kind === 'fault' ? (
        <div role="alert" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', color: 'var(--fg-muted)' }}>
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
        sessionSetupAvailable &&
        !conversationQuery.isPending &&
        otherMembers.length > 0 ? (
          <div className={styles['emptyThread']}>
            <p>No decrypted messages yet on this device.</p>
          </div>
        ) : null}
        {rows.map((row) => (
          <MessageRow key={row.id} row={row} />
        ))}
        {notice === null ? null : (
          <div className={styles['emptyThread']}>
            <p>{notice}</p>
          </div>
        )}
      </div>

      {enrolled ? (
        <form
          style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem 1rem' }}
          onSubmit={(event) => {
            event.preventDefault();
            void handleSend();
          }}
        >
          <textarea
            aria-label="Message body"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={2}
            disabled={!sessionSetupAvailable}
            style={{ flex: 1, resize: 'vertical' }}
            placeholder={sessionSetupAvailable ? 'Write a message…' : 'Sending is unavailable'}
          />
          <button
            type="submit"
            disabled={!sessionSetupAvailable || sending || draft.trim() === ''}
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </form>
      ) : null}
    </div>
  );
}

function MessageRow({ row }: { row: InboxRow }): JSX.Element {
  if (row.kind === 'message') {
    return (
      <div
        style={{
          padding: '0.5rem 1rem',
          marginLeft: row.sentByViewer ? '20%' : '0',
          marginRight: row.sentByViewer ? '0' : '20%',
          background: row.sentByViewer ? 'var(--bg-raised, rgba(127,127,127,0.12))' : 'transparent',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
        }}
      >
        <strong>{row.senderLabel === 'you' ? 'you' : row.senderLabel}</strong>
        <p style={{ margin: '0.15rem 0 0' }}>{row.body}</p>
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

import { randomUUID } from 'node:crypto';

import { CONVERSATION_SECURITY_MODE } from '../api/wire/enums.js';
import type {
  Conversation,
  GetConversationRequest,
  GetConversationResponse,
  ListConversationsRequest,
  ListConversationsResponse,
  ListMessageRequestsRequest,
  ListMessageRequestsResponse,
  ListMessagesRequest,
  ListMessagesResponse,
  MarkConversationReadRequest,
  MarkConversationReadResponse,
  Message,
  MessageRequest,
  RespondToMessageRequestRequest,
  RespondToMessageRequestResponse,
  SendMessageRequest,
  SendMessageResponse,
} from '../api/wire/types.js';
import { Box, Text, useInput, useStdin } from 'ink';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useContentSize } from '../app/layout.js';
import { movementTarget } from '../app/list-movement.js';
import { present } from '../api/present.js';
import { Loading } from '../components/Loading.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { glyph } from '../theme/glyphs.js';
import { theme } from '../theme/index.js';
import type { GlyphSetName } from '../theme/themes/types.js';

export const DM_DISCLOSURE =
  "Not end-to-end encrypted — this node's operators can read these messages.";

/** Promise-based seam for the shell to adapt to its authenticated transport later. */
export interface MessagesScreenApi {
  listConversations(request: ListConversationsRequest): Promise<ListConversationsResponse>;
  getConversation(request: GetConversationRequest): Promise<GetConversationResponse>;
  listMessages(request: ListMessagesRequest): Promise<ListMessagesResponse>;
  sendMessage(request: SendMessageRequest): Promise<SendMessageResponse>;
  markConversationRead(request: MarkConversationReadRequest): Promise<MarkConversationReadResponse>;
  listMessageRequests(request: ListMessageRequestsRequest): Promise<ListMessageRequestsResponse>;
  respondToMessageRequest(
    request: RespondToMessageRequestRequest,
  ): Promise<RespondToMessageRequestResponse>;
}

export interface MessagesScreenProps {
  api: MessagesScreenApi;
  isActive: boolean;
  /** The shell can open an existing thread directly (for example from another screen). */
  initialConversationId?: string | undefined;
  /** Used only to omit the viewer from a conversation's participant label. */
  viewerActorId?: string | undefined;
  /** Esc from the top-level conversation list returns control to the shell. */
  onBack?: (() => void) | undefined;
  /** Injectable so screen tests and alternate shells do not depend on Node randomness. */
  createRequestId?: (() => string) | undefined;
  /** Glyph set for the pending-send indicator (P12-114); defaults to `unicode` like the
   * rest of the shell does before a caller lifts preference state up to it. */
  glyphSet?: GlyphSetName | undefined;
  /**
   * This node's DM retention window in days, from `NodePolicy.retention.dmRetentionDays`
   * (0 means "no limit enforced"). Omitted when the caller hasn't fetched node policy yet —
   * the screen renders nothing about retention rather than guess, since an absent number is
   * not the same claim as "no limit" (spec §197.6).
   */
  dmRetentionDays?: number | undefined;
  /** Opens the safety number screen for a conversation's peer. */
  onOpenSafetyNumber?: ((actorId: string) => void) | undefined;
}

type Folder = 'inbox' | 'requests';

interface Page<T> {
  items: readonly T[];
  nextCursor: string;
  hasMore: boolean;
}

interface KeysetList<T> {
  items: readonly T[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | undefined;
  loadMore: () => void;
}

interface StoredPage<T> {
  identity: string;
  items: readonly T[];
  cursor: string;
  hasMore: boolean;
  loadingMore: boolean;
  error: string | undefined;
}

function useKeysetList<T>(
  enabled: boolean,
  identity: string,
  fetchPage: (cursor: string) => Promise<Page<T>>,
  errorMessage: string,
): KeysetList<T> {
  const [stored, setStored] = useState<StoredPage<T>>({
    identity: '',
    items: [],
    cursor: '',
    hasMore: false,
    loadingMore: false,
    error: undefined,
  });
  const fetching = useRef(false);
  const generation = useRef(0);
  const isCurrent = enabled && stored.identity === identity;

  useEffect(() => {
    const currentGeneration = generation.current + 1;
    generation.current = currentGeneration;
    fetching.current = enabled;
    if (!enabled) return;

    fetchPage('')
      .then((page) => {
        if (generation.current !== currentGeneration) return;
        setStored({
          identity,
          items: page.items,
          cursor: page.nextCursor,
          hasMore: page.hasMore,
          loadingMore: false,
          error: undefined,
        });
      })
      .catch(() => {
        if (generation.current === currentGeneration) {
          setStored({
            identity,
            items: [],
            cursor: '',
            hasMore: false,
            loadingMore: false,
            error: errorMessage,
          });
        }
      })
      .finally(() => {
        if (generation.current === currentGeneration) {
          fetching.current = false;
        }
      });
  }, [enabled, errorMessage, fetchPage, identity]);

  const loadMore = useCallback(() => {
    if (fetching.current || !isCurrent || !stored.hasMore) return;
    const currentGeneration = generation.current;
    fetching.current = true;
    setStored((current) =>
      current.identity === identity ? { ...current, loadingMore: true } : current,
    );
    fetchPage(stored.cursor)
      .then((page) => {
        if (generation.current !== currentGeneration) return;
        setStored((current) =>
          current.identity === identity
            ? {
                ...current,
                items: [...current.items, ...page.items],
                cursor: page.nextCursor,
                hasMore: page.hasMore,
                loadingMore: false,
                error: undefined,
              }
            : current,
        );
      })
      .catch(() => {
        if (generation.current === currentGeneration) {
          setStored((current) =>
            current.identity === identity
              ? { ...current, loadingMore: false, error: errorMessage }
              : current,
          );
        }
      })
      .finally(() => {
        if (generation.current === currentGeneration) {
          fetching.current = false;
        }
      });
  }, [errorMessage, fetchPage, identity, isCurrent, stored.cursor, stored.hasMore]);

  return {
    items: isCurrent ? stored.items : [],
    loading: enabled && !isCurrent,
    loadingMore: isCurrent && stored.loadingMore,
    hasMore: isCurrent && stored.hasMore,
    error: isCurrent ? stored.error : undefined,
    loadMore,
  };
}

function actorLabel(actor: { handle: string; displayName: string } | null | undefined): string {
  if (!present(actor)) return 'unknown actor';
  const handle = sanitizeForTerminal(actor.handle);
  const displayName = sanitizeForTerminal(actor.displayName);
  return displayName === '' ? `@${handle}` : `${displayName} (@${handle})`;
}

function conversationLabel(conversation: Conversation, viewerActorId?: string): string {
  const active = conversation.members.filter(
    (member) => !present(member.leftAt) && present(member.actor),
  );
  const peers = active.filter((member) => member.actor?.id !== viewerActorId);
  const shown = peers.length === 0 ? active : peers;
  if (shown.length === 0) return `Conversation ${sanitizeForTerminal(conversation.id)}`;
  return shown.map((member) => actorLabel(member.actor)).join(', ');
}

function messageBody(message: Message): string {
  return present(message.deletedAt) ? '[deleted]' : sanitizeForTerminal(message.body);
}

/**
 * Node-policy retention copy (P12-114, spec §197.6). `undefined` means the caller hasn't
 * fetched `NodePolicy.retention.dmRetentionDays` yet, and renders nothing — silence is not
 * the same claim as "no limit enforced" (`0`), so the two must stay distinguishable.
 */
function retentionCopyFor(dmRetentionDays: number | undefined): string | undefined {
  if (dmRetentionDays === undefined) return undefined;
  if (dmRetentionDays <= 0)
    return "This node's operators enforce no automatic deletion window for messages.";
  return `This node automatically deletes messages older than ${String(dmRetentionDays)} day${dmRetentionDays === 1 ? '' : 's'}.`;
}

type View = 'list' | 'thread' | 'requests';

interface PendingMessage {
  id: string;
  body: string;
}

/**
 * Conversations, one thread, and incoming requests in a single keyboard-first slice.
 * Lists use opaque keyset cursors; thread rows are reversed for chronological display.
 */
export function MessagesScreen({
  api,
  isActive,
  initialConversationId,
  viewerActorId,
  onBack,
  createRequestId = randomUUID,
  glyphSet = 'unicode',
  dmRetentionDays,
  onOpenSafetyNumber,
}: MessagesScreenProps): ReactElement {
  const { rows } = useContentSize();
  const { isRawModeSupported } = useStdin();
  const [view, setView] = useState<View>(initialConversationId === undefined ? 'list' : 'thread');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | undefined>();
  const [conversationId, setConversationId] = useState(initialConversationId ?? '');
  const [selectedListRow, setSelectedListRow] = useState(0);
  const [selectedRequestRow, setSelectedRequestRow] = useState(0);
  const [resolvedRequests, setResolvedRequests] = useState<ReadonlySet<string>>(new Set());
  const [draft, setDraft] = useState('');
  const [pendingMessages, setPendingMessages] = useState<readonly PendingMessage[]>([]);
  const [sentMessages, setSentMessages] = useState<readonly Message[]>([]);
  const [sending, setSending] = useState(false);
  const [threadError, setThreadError] = useState<string | undefined>();
  const [requestStatus, setRequestStatus] = useState<string | undefined>();

  const fetchConversations = useCallback(
    (cursor: string): Promise<Page<Conversation>> =>
      api.listConversations({ cursor, limit: 20 }).then((response) => ({
        items: response.conversations,
        nextCursor: response.page?.nextCursor ?? '',
        hasMore: response.page?.hasMore ?? false,
      })),
    [api],
  );
  const conversations = useKeysetList(
    true,
    'conversations',
    fetchConversations,
    'Could not load conversations.',
  );

  const fetchRequests = useCallback(
    (cursor: string): Promise<Page<MessageRequest>> =>
      api.listMessageRequests({ cursor, limit: 20 }).then((response) => ({
        items: response.requests,
        nextCursor: response.page?.nextCursor ?? '',
        hasMore: response.page?.hasMore ?? false,
      })),
    [api],
  );
  const requests = useKeysetList(
    view === 'requests',
    'requests',
    fetchRequests,
    'Could not load message requests.',
  );
  const visibleRequests = requests.items.filter((request) => !resolvedRequests.has(request.id));

  const fetchMessages = useCallback(
    (cursor: string): Promise<Page<Message>> => {
      if (conversationId === '') {
        return Promise.resolve({ items: [], nextCursor: '', hasMore: false });
      }
      return api.listMessages({ conversationId, cursor, limit: 30 }).then((response) => {
        const newest = response.messages[0];
        if (cursor === '' && newest !== undefined) {
          void api
            .markConversationRead({ conversationId, throughMessageId: newest.id })
            .catch(() => {
              // Read state is best-effort; no receipt or error surface is exposed.
            });
        }
        return {
          items: response.messages,
          nextCursor: response.page?.nextCursor ?? '',
          hasMore: response.page?.hasMore ?? false,
        };
      });
    },
    [api, conversationId],
  );
  const messages = useKeysetList(
    view === 'thread' && conversationId !== '',
    conversationId,
    fetchMessages,
    'Could not load messages.',
  );

  useEffect(() => {
    if (view !== 'thread' || conversationId === '') return;
    let cancelled = false;
    api
      .getConversation({ id: conversationId })
      .then((response) => {
        if (!cancelled && present(response.conversation)) {
          setSelectedConversation(response.conversation);
        }
      })
      .catch(() => {
        if (!cancelled) setThreadError('Could not refresh this conversation.');
      });
    return () => {
      cancelled = true;
    };
  }, [api, conversationId, view]);

  const visibleCount = Math.max(3, rows - 4);
  const effectiveListRow = Math.min(selectedListRow, Math.max(conversations.items.length - 1, 0));
  const effectiveRequestRow = Math.min(selectedRequestRow, Math.max(visibleRequests.length - 1, 0));

  function openConversation(conversation: Conversation): void {
    setSelectedConversation(conversation);
    setConversationId(conversation.id);
    setDraft('');
    setPendingMessages([]);
    setSentMessages([]);
    setThreadError(undefined);
    setView('thread');
  }

  function backToList(): void {
    setView('list');
    setConversationId('');
    setSelectedConversation(undefined);
    setDraft('');
    setPendingMessages([]);
    setSentMessages([]);
    setThreadError(undefined);
  }

  async function sendDraft(): Promise<void> {
    const body = draft;
    if (body.trim() === '' || conversationId === '' || sending) return;
    const clientRequestId = createRequestId();
    setSending(true);
    setThreadError(undefined);
    setDraft('');
    setPendingMessages((current) => [...current, { id: clientRequestId, body }]);
    try {
      const response = await api.sendMessage({ clientRequestId, conversationId, body });
      setPendingMessages((current) => current.filter((message) => message.id !== clientRequestId));
      if (present(response.message)) {
        const sentMessage = response.message;
        setSentMessages((current) => [...current, sentMessage]);
      }
    } catch {
      setPendingMessages((current) => current.filter((message) => message.id !== clientRequestId));
      setDraft(body);
      setThreadError('Message was not sent. Your draft is still here.');
    } finally {
      setSending(false);
    }
  }

  async function respondToSelectedRequest(accept: boolean): Promise<void> {
    const request = visibleRequests[effectiveRequestRow];
    if (request === undefined) return;
    setRequestStatus(accept ? 'Accepting request…' : 'Declining request…');
    try {
      const response = await api.respondToMessageRequest({ id: request.id, accept });
      setResolvedRequests((current) => new Set(current).add(request.id));
      if (accept && present(response.conversation)) {
        openConversation(response.conversation);
        return;
      }
      setRequestStatus(accept ? 'Request accepted.' : 'Request declined.');
    } catch {
      setRequestStatus('Could not update that request.');
    }
  }

  useInput(
    (input, key) => {
      if (key.escape) {
        if (view === 'thread' || view === 'requests') backToList();
        else onBack?.();
        return;
      }

      if (view === 'list') {
        if (input === 'r' || key.tab) {
          setRequestStatus(undefined);
          setView('requests');
          return;
        }
        if ((input === 'n' || input === ' ') && conversations.hasMore) {
          conversations.loadMore();
          return;
        }
        const moved = movementTarget({
          input,
          key,
          current: effectiveListRow,
          total: conversations.items.length,
          pageSize: visibleCount,
        });
        if (moved !== undefined) {
          setSelectedListRow(moved);
          return;
        }
        if (input === 's') {
          const conversation = conversations.items[effectiveListRow];
          if (conversation !== undefined && onOpenSafetyNumber !== undefined) {
            const peer = conversation.members.find(
              (member) => member.actor?.id !== viewerActorId,
            )?.actor;
            if (peer !== undefined) onOpenSafetyNumber(peer.id);
          }
          return;
        }
        if (key.return) {
          const conversation = conversations.items[effectiveListRow];
          if (conversation !== undefined) openConversation(conversation);
        }
        return;
      }

      if (view === 'requests') {
        if (key.tab) {
          setView('list');
          return;
        }
        if ((input === 'n' || input === ' ') && requests.hasMore) {
          requests.loadMore();
          return;
        }
        const moved = movementTarget({
          input,
          key,
          current: effectiveRequestRow,
          total: visibleRequests.length,
          pageSize: visibleCount,
        });
        if (moved !== undefined) {
          setSelectedRequestRow(moved);
          return;
        }
        if (input === 'a') void respondToSelectedRequest(true);
        if (input === 'd') void respondToSelectedRequest(false);
        return;
      }

      if (key.tab && messages.hasMore) {
        messages.loadMore();
        return;
      }
      if (key.return) {
        void sendDraft();
        return;
      }
      if (sending) return;
      if (key.backspace || key.delete) {
        setDraft((current) => Array.from(current).slice(0, -1).join(''));
        return;
      }
      if (input !== '' && !key.ctrl && !key.meta) {
        const safeInput = sanitizeForTerminal(input).replaceAll('\n', ' ');
        setDraft((current) => Array.from(`${current}${safeInput}`).slice(0, 2_000).join(''));
      }
    },
    { isActive: isActive && isRawModeSupported },
  );

  const chronologicalMessages = [...messages.items].reverse();
  const knownMessageIds = new Set(chronologicalMessages.map((message) => message.id));
  const locallySent = sentMessages.filter((message) => !knownMessageIds.has(message.id));
  const folder: Folder = view === 'requests' ? 'requests' : 'inbox';
  const retentionCopy = retentionCopyFor(dmRetentionDays);

  return (
    <Box flexDirection="column">
      <Text color={theme.warn}>{DM_DISCLOSURE}</Text>
      <Text color={theme.accent}>Messages</Text>
      {retentionCopy === undefined ? null : <Text color={theme.muted}>{retentionCopy}</Text>}
      {view === 'thread' ? null : (
        <Text>
          <Text bold={folder === 'inbox'} inverse={folder === 'inbox'}>
            {' Inbox '}
          </Text>
          <Text> </Text>
          <Text bold={folder === 'requests'} inverse={folder === 'requests'}>
            {' Requests '}
          </Text>
          <Text color={theme.muted}> · Tab switches</Text>
        </Text>
      )}

      {view === 'list' ? (
        <Box marginTop={1} flexDirection="column">
          {conversations.error === undefined ? null : (
            <Text color={theme.error}>{conversations.error}</Text>
          )}
          {conversations.loading ? <Loading label="Loading conversations" /> : null}
          {!conversations.loading && conversations.items.length === 0 ? (
            <Text color={theme.muted}>No conversations yet.</Text>
          ) : null}
          {conversations.items.map((conversation, index) => (
            <Text
              key={conversation.id}
              color={isActive && index === effectiveListRow ? theme.accent : theme.text}
              bold={isActive && index === effectiveListRow}
            >
              {isActive && index === effectiveListRow ? '› ' : '  '}
              {conversationLabel(conversation, viewerActorId)}
              {conversation.securityMode === CONVERSATION_SECURITY_MODE.E2EE_V1
                ? ' [E2EE]'
                : ' [Server-visible]'}
              {conversation.unreadCount > 0 ? ` · ${String(conversation.unreadCount)} unread` : ''}
            </Text>
          ))}
          {conversations.loadingMore ? <Loading label="Loading more" /> : null}
          <Text color={theme.muted}>
            Enter open · r requests · Tab folder · n / space more · Esc back
          </Text>
        </Box>
      ) : null}

      {view === 'thread' ? (
        <Box marginTop={1} flexDirection="column">
          <Text bold>
            {selectedConversation === undefined
              ? sanitizeForTerminal(conversationId)
              : `${conversationLabel(selectedConversation, viewerActorId)}${
                  selectedConversation.securityMode === CONVERSATION_SECURITY_MODE.E2EE_V1
                    ? ' [E2EE]'
                    : ' [Server-visible]'
                }`}
          </Text>
          {threadError === undefined ? null : (
            <Text color={theme.error}>{threadError} Enter retries with the same text.</Text>
          )}
          {messages.error === undefined ? null : <Text color={theme.error}>{messages.error}</Text>}
          {messages.loading ? <Loading label="Loading messages" /> : null}
          {messages.hasMore ? <Text color={theme.muted}>Tab loads older messages</Text> : null}
          {chronologicalMessages.map((message) => (
            <Text key={message.id}>
              <Text color={theme.muted}>{actorLabel(message.sender)}: </Text>
              {messageBody(message)}
            </Text>
          ))}
          {locallySent.map((message) => (
            <Text key={message.id}>
              <Text color={theme.muted}>{actorLabel(message.sender)}: </Text>
              {messageBody(message)}
            </Text>
          ))}
          {pendingMessages.map((message) => (
            <Text key={message.id}>
              <Text color={theme.muted}>{glyph('pending', glyphSet)} you: </Text>
              {sanitizeForTerminal(message.body)} <Text color={theme.muted}>· sending</Text>
            </Text>
          ))}
          <Box marginTop={1}>
            <Text color={theme.accent}>Draft: </Text>
            <Text>{draft}</Text>
          </Box>
          <Text color={theme.muted}>Enter send · Backspace edit · Esc conversations</Text>
        </Box>
      ) : null}

      {view === 'requests' ? (
        <Box marginTop={1} flexDirection="column">
          <Text bold>Message requests</Text>
          {requests.error === undefined ? null : <Text color={theme.error}>{requests.error}</Text>}
          {requestStatus === undefined ? null : <Text color={theme.muted}>{requestStatus}</Text>}
          {requests.loading ? <Loading label="Loading requests" /> : null}
          {!requests.loading && visibleRequests.length === 0 ? (
            <Text color={theme.muted}>No pending requests.</Text>
          ) : null}
          {visibleRequests.map((request, index) => (
            <Text
              key={request.id}
              color={isActive && index === effectiveRequestRow ? theme.accent : theme.text}
              bold={isActive && index === effectiveRequestRow}
            >
              {isActive && index === effectiveRequestRow ? '› ' : '  '}
              {actorLabel(request.sender)}: {sanitizeForTerminal(request.body)}
            </Text>
          ))}
          {requests.loadingMore ? <Loading label="Loading more" /> : null}
          <Text color={theme.muted}>
            a accept · d decline · Tab folder · n / space more · Esc conversations
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}

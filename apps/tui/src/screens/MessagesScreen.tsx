import { randomUUID } from 'node:crypto';

import { ConnectError } from '@connectrpc/connect';
import {
  mayDescribeAsEndToEndEncrypted,
  requiredConversationDisclosure,
  type ConversationSecurityMode as DomainConversationSecurityMode,
} from '@patches/domain';
import { CONVERSATION_SECURITY_MODE, E2EE_GROUP_CHANGE_KIND } from '../api/wire/enums.js';
import type {
  Conversation,
  GetConversationRequest,
  GetConversationResponse,
  GetDeviceRosterResponse,
  GetIdentityRootResponse,
  ListConversationsRequest,
  ListConversationsResponse,
  ListE2eeGroupControlEventsResponse,
  MarkConversationReadRequest,
  MarkConversationReadResponse,
} from '../api/wire/types.js';
import { Box, Text, useInput, useStdin } from 'ink';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useContentSize } from '../app/layout.js';
import { movementTarget } from '../app/list-movement.js';
import {
  nextPollDelayMs,
  TUI_CONVERSATION_LIST_POLL_MS,
  TUI_POLL_BACKOFF_MAX_MS,
  TUI_THREAD_MAIL_POLL_MS,
  TUI_THREAD_SECURITY_POLL_MS,
} from '../app/poll-intervals.js';
import { present } from '../api/present.js';
import { mergeUnread } from '../e2ee/conversation-unread.js';
import { Loading } from '../components/Loading.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { E2eeNotEnrolledError, E2EE_QUARANTINED_MESSAGE_COPY } from '../e2ee/runtime.js';
import type { InboxRow as E2eeReceivedRow } from '../e2ee/runtime.js';
import { glyph } from '../theme/glyphs.js';
import { theme } from '../theme/index.js';
import type { GlyphSetName } from '../theme/themes/types.js';

/** The vault-fault banners (P13-010): lost history is stated as lost, never as empty. */
export const VAULT_FAULT_COPY = {
  corrupt:
    'Your encrypted message history on this device cannot be opened: the local encrypted store failed its integrity check. Past messages stay inaccessible here; nothing was silently reset.',
  rollback:
    'Your encrypted message history on this device cannot be opened: the local store is older than what this device already committed (a restored backup?). Past messages stay inaccessible here; nothing was silently reset.',
} as const;

const VAULT_FAULT_HINT =
  'Erasing it is explicit: `patches logout --wipe-e2ee`, or choose the wipe offered after revoking a device in :devices.';

/** Sends paused on an identity change (ADR 0020 §3): acknowledged, never silent. */
const IDENTITY_CHANGED_COPY =
  'The other side’s messaging identity changed since you opened this conversation. Sending is paused until you re-verify — press s to compare safety numbers, then close and reopen this conversation.';

const ROSTER_CHANGED_COPY =
  'The other side’s enrolled devices changed since you opened this conversation. Verify before sending — press s to compare safety numbers.';

/** Shown instead of silently falling back to the plaintext send path (ADR 0020 §1.2). */
const E2EE_SEND_UNAVAILABLE_COPY =
  'Sending into an end-to-end conversation needs an enrolled device, which this client does not have yet. Your draft is kept.';

const MEMBERSHIP_CONFLICT_COPY =
  'This conversation’s membership changed while it was being read. Close and reopen the conversation to load the new membership epoch, then try again.';

/** Promise-based seam for the shell to adapt to its authenticated transport later. */
export interface MessagesScreenApi {
  listConversations(request: ListConversationsRequest): Promise<ListConversationsResponse>;
  getConversation(request: GetConversationRequest): Promise<GetConversationResponse>;
  markConversationRead(request: MarkConversationReadRequest): Promise<MarkConversationReadResponse>;
  /** Optional because only shells with an authenticated `E2eeService` transport provide
   * the security surfaces below; without them the screen renders mode labels but no
   * verification state, transcript, or change interstitials. */
  getIdentityRoot?(request: { actorId: string }): Promise<GetIdentityRootResponse>;
  getDeviceRoster?(request: { actorId: string }): Promise<GetDeviceRosterResponse>;
  listE2eeGroupControlEvents?(request: {
    conversationId: string;
    afterEpoch: bigint;
    limit: number;
  }): Promise<ListE2eeGroupControlEventsResponse>;
  /**
   * B-101: when present, the membership transcript is signature-verified client-side
   * (each event against its signer's certified device key) before display. Absent keeps
   * the plain node-served listing.
   */
  verifyGroupControlEvents?(request: { conversationId: string }): Promise<{
    allVerified: boolean;
    rows: readonly {
      epoch: bigint;
      change: 'ADDED' | 'REMOVED' | 'UNKNOWN';
      subjectActorId: string;
      signatureVerified: boolean;
    }[];
  }>;
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
  /**
   * Peers whose safety number the viewer has compared and confirmed in this session
   * (`v` on the safety-number screen). Session-scoped by design: this client keeps no
   * persistent verified-state database yet, so it renders what it actually knows.
   */
  verifiedPeers?: ReadonlySet<string> | undefined;
  /**
   * This node's `GetE2eeCapability` state (ENABLED/DISABLED since ADR 0036's owner override —
   * E2EE is no longer a staged rollout). Accepted for the shell's own use (e.g. `App.tsx`'s
   * `e2eeAdvertised`); this screen no longer renders anything from it directly.
   */
  e2eeCapabilityState?: number | undefined;
  /**
   * The only route an end-to-end conversation's sends may take (P13-006/P13-010): the
   * shell's vault-backed stage → send → confirm pipeline. Absent means this shell has no
   * such pipeline, and composing shows why instead of silently using the plaintext RPC.
   */
  sendE2ee?:
    ((conversationId: string, body: string) => Promise<E2eeReceivedRow | undefined>) | undefined;
  /** Set once the account's local vault failed to open — history is inaccessible, and
   * the screen says exactly that rather than rendering an empty-but-fine list. */
  e2eeVaultFault?: 'corrupt' | 'rollback' | undefined;
  /** How often an open end-to-end thread re-checks the peer's roots/roster chain.
   * Tests pass a small value; the default is deliberately unhurried. */
  securityPollMs?: number | undefined;
  /**
   * B-101: drains the viewer's end-to-end mailbox for this conversation and returns
   * render-ready rows (decrypted messages, franking-failure placeholders, labeled
   * history transfers). The callback owns decryption, durable receive-state commits,
   * and acknowledgement; the screen only renders what survived validation.
   */
  receiveE2ee?: ((conversationId: string) => Promise<readonly E2eeReceivedRow[]>) | undefined;
  /** How often an open end-to-end thread polls its mailbox. Tests pass a small value. */
  mailPollMs?: number | undefined;
  /**
   * #383: this device's durable per-conversation unread count, read back from the vault.
   * Absent means this shell has no vault-backed sender, so the server's `unreadCount` is
   * used as the badge as-is. A locally-read conversation reports `0` even if the server's
   * count lags, which is what lets a read thread stay read across a reload.
   */
  conversationUnread?: ((conversationId: string) => Promise<number | undefined>) | undefined;
  /** #383: marks a conversation read through on THIS device (vault) — companion to the
   * server-side `markConversationRead`, so a locally-read thread stays read across a
   * reload even if the node's count lags. Absent without a vault-backed sender. */
  clearConversationUnread?: ((conversationId: string) => void) | undefined;
  /**
   * P19-017: how often the conversation list refreshes while it is open and this
   * screen is the active one (ADR 0032 §1). Tests pass a small value; the default is
   * `TUI_CONVERSATION_LIST_POLL_MS`.
   */
  conversationListPollMs?: number | undefined;
  /**
   * P19-018: fired after a successful `MarkConversationRead` so the shell can refresh
   * the status-bar unread badge (`useUnreadCount`'s poll otherwise only refires on a
   * screen change or its own 60s interval — the same pattern `NotificationsScreen`
   * already uses for `MarkNotificationsRead`).
   */
  onReadStateChanged?: (() => void) | undefined;
  /**
   * P19-016: the shell's global `Ctrl+R` (`App.tsx`'s `manualRefresh`, documented in
   * `keymap.ts` as "shows what is new"). Bumping this forces an immediate re-check of
   * whichever DM surface is open — the conversation list's page 1, or the open thread's
   * conversation state and end-to-end mailbox — on top of (not instead of) their normal
   * `conversationListPollMs`/`mailPollMs` ticks. §194 forbids inventing a second binding
   * for this, so this reuses the one key the ribbon already promises does this everywhere.
   */
  refreshToken?: number | undefined;
}

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
  /**
   * Bumped by a caller that wants a background page-1 refresh without resetting
   * `identity` (P19-017). Since `identity` itself doesn't change, `isCurrent` stays
   * true across the refetch — the list keeps rendering its last-known items with no
   * loading flash, exactly like every other background poll in this screen.
   */
  refreshToken?: number,
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
        if (generation.current !== currentGeneration) return;
        // A failed refresh of an already-loaded list must never render as "no
        // messages" (the same house rule the in-thread mailbox poll and the unread
        // badge already keep): if this identity was already current, keep its items
        // and surface only the error. A failed *first* load for this identity still
        // has nothing to preserve.
        setStored((current) =>
          current.identity === identity
            ? { ...current, loadingMore: false, error: errorMessage }
            : {
                identity,
                items: [],
                cursor: '',
                hasMore: false,
                loadingMore: false,
                error: errorMessage,
              },
        );
      })
      .finally(() => {
        if (generation.current === currentGeneration) {
          fetching.current = false;
        }
      });
  }, [enabled, errorMessage, fetchPage, identity, refreshToken]);

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
  if (!present(actor)) return 'unknown account';
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

/**
 * P19-016: `keymap.ts` documents `Ctrl+R` globally as "shows what is new" — this states,
 * on the surfaces where it applies, exactly what that means for DMs: a poll-based check
 * that only ever runs while the client is open, never a delivery push. The interval is
 * always the caller's actual `pollMs` (which defaults to the ADR 0032 constant in
 * `poll-intervals.ts`), never a restated literal, so this can't drift from what the
 * screen is really doing.
 */
export function dmFreshnessCopy(surface: 'list' | 'thread', pollMs: number): string {
  const seconds = Math.round(pollMs / 1000);
  const where = surface === 'list' ? 'this list is open' : 'this thread is open';
  return `Checks for new messages while ${where}, about every ${String(seconds)}s — press Ctrl+R to check now. Nothing arrives while this client is closed.`;
}

type View = 'list' | 'thread' | 'transcript';

interface PendingMessage {
  id: string;
  body: string;
}

/**
 * The wire's numeric mode, mapped into the domain vocabulary its disclosure rules speak.
 * `LEGACY_SERVER_VISIBLE` is reserved, never issued (ADR 0030/B-095) — only `E2EE_V1`
 * conversations reach this client, but an unrecognised wire value still renders nothing
 * rather than guessing.
 */
function domainModeOf(
  mode: Conversation['securityMode'],
): DomainConversationSecurityMode | undefined {
  if (mode === CONVERSATION_SECURITY_MODE.E2EE_V1) return 'E2EE_V1';
  return undefined;
}

function isE2eeConversation(conversation: Conversation | undefined): boolean {
  return conversation?.securityMode === CONVERSATION_SECURITY_MODE.E2EE_V1;
}

/** The one peer of a direct conversation, excluding the viewer. */
function peerActorIdOf(
  conversation: Conversation | undefined,
  viewerActorId?: string,
): string | undefined {
  if (conversation === undefined) return undefined;
  const active = conversation.members.filter(
    (member) => !present(member.leftAt) && present(member.actor),
  );
  const peer = active.find((member) => member.actor?.id !== viewerActorId)?.actor;
  return peer?.id ?? active[0]?.actor?.id;
}

/**
 * `E2EE_GROUP_CONTROL_CONFLICT` arrives as an application code in response metadata
 * (`docs/architecture/api.md` §7). A concurrent membership transition is a normal,
 * recoverable outcome for a small group — the copy says what happened and what to do,
 * never fragments of the failing request.
 */
function isMembershipConflict(error: unknown): boolean {
  try {
    return (
      ConnectError.from(error).metadata.get('x-patches-error-code') ===
      'E2EE_GROUP_CONTROL_CONFLICT'
    );
  } catch {
    return false;
  }
}

interface TranscriptRow {
  epoch: bigint;
  change: 'ADDED' | 'REMOVED' | 'UNKNOWN';
  subjectActorId: string;
  /** Present only when the transcript came back signature-verified (B-101 seam). */
  signatureVerified?: boolean | undefined;
}

/** ADR 0025 §4's neutral placeholder for a message that failed its franking check. */
export function unverifiableMessageCopy(senderLabel: string): string {
  return `A message from ${senderLabel} could not be verified and was not shown.`;
}

/** Baseline security facts captured when a thread opens; changes against them raise interstitials. */
interface PeerSecurityBaseline {
  actorId: string;
  rootGeneration: number;
  rootPublicKeyHex: string;
  rosterSequence: string;
  rosterDigestHex: string;
}

type PeerSecurityStatus =
  { status: 'ok' } | { status: 'identityChanged' } | { status: 'rosterChanged' };

function toHex(bytes: Uint8Array | undefined): string {
  if (bytes === undefined) return '';
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
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
  verifiedPeers,
  sendE2ee,
  e2eeVaultFault,
  securityPollMs = TUI_THREAD_SECURITY_POLL_MS,
  receiveE2ee,
  conversationUnread,
  clearConversationUnread,
  mailPollMs = TUI_THREAD_MAIL_POLL_MS,
  conversationListPollMs = TUI_CONVERSATION_LIST_POLL_MS,
  onReadStateChanged,
  refreshToken,
}: MessagesScreenProps): ReactElement {
  const { rows } = useContentSize();
  const { isRawModeSupported } = useStdin();
  const [view, setView] = useState<View>(initialConversationId === undefined ? 'list' : 'thread');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | undefined>();
  const [conversationId, setConversationId] = useState(initialConversationId ?? '');
  const [selectedListRow, setSelectedListRow] = useState(0);
  const [draft, setDraft] = useState('');
  const [pendingMessages, setPendingMessages] = useState<readonly PendingMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [threadError, setThreadError] = useState<string | undefined>();
  // P13-010 change/compromise interstitials: baseline vs. now for the open thread's peer.
  const [peerSecurity, setPeerSecurity] = useState<PeerSecurityStatus>({ status: 'ok' });
  const peerBaseline = useRef<PeerSecurityBaseline | undefined>(undefined);
  // `G` — the group-control transcript of the open conversation.
  const [transcript, setTranscript] = useState<
    | { status: 'hidden' }
    | { status: 'loading' }
    | { status: 'shown'; rows: readonly TranscriptRow[]; allVerified?: boolean | undefined }
    | { status: 'error'; message: string }
  >({ status: 'hidden' });
  // B-101 mailbox rows for the open end-to-end thread (deduped by envelope id).
  const [e2eeRows, setE2eeRows] = useState<readonly E2eeReceivedRow[]>([]);
  // P19-018: conversation ids marked read locally this session, so the list badge
  // clears without waiting for the next `ListConversations` poll tick to land. Never
  // removed once set, same as `NotificationsScreen`'s `readOverride` — a conversation
  // only gets less unread by the caller opening it, and a fresh poll re-fetches for real.
  const [readOverrideIds, setReadOverrideIds] = useState<ReadonlySet<string>>(new Set());
  // P19-017: bumped on a `conversationListPollMs` interval while the list is open and
  // this screen is active, so `useKeysetList` re-fetches page 1 without resetting its
  // `identity` (see that hook's `refreshToken` param — no loading flash, no second
  // independent fetch path).
  const [conversationListRefreshTick, setConversationListRefreshTick] = useState(0);

  // Marks the open conversation read exactly once per open: keyed only on
  // `conversationId`, so re-renders, polling ticks, and prop changes never re-fire it,
  // but leaving and reopening the same thread (or opening a different one) does.
  useEffect(() => {
    if (conversationId === '') return;
    const target = conversationId;
    // #383: durable local read — the vault clear must not depend on the server RPC, and
    // a failed one must never resurface unread locally.
    clearConversationUnread?.(target);
    let cancelled = false;
    api
      .markConversationRead({ conversationId: target, throughMessageId: '' })
      .then(() => {
        if (cancelled) return;
        setReadOverrideIds((current) =>
          current.has(target) ? current : new Set(current).add(target),
        );
        onReadStateChanged?.();
      })
      .catch(() => {
        // Best-effort, matching `NotificationsScreen`'s `markReadThrough`: a failed
        // mark-read must never be mistaken for "now read" locally, so no override is
        // set and the badge keeps showing what the server actually believes.
      });
    return () => {
      cancelled = true;
    };
  }, [api, conversationId, onReadStateChanged, clearConversationUnread]);

  const fetchConversations = useCallback(
    (cursor: string): Promise<Page<Conversation>> =>
      api.listConversations({ cursor, limit: 20 }).then((response) => ({
        items: response.conversations,
        nextCursor: response.page?.nextCursor ?? '',
        hasMore: response.page?.hasMore ?? false,
      })),
    [api],
  );
  // `Ctrl+R` is folded into the same tick the periodic list poll bumps (rather than a
  // second dependency) so `useKeysetList`'s effect only ever has one reason to refetch:
  // both counters only ever increase, so their sum changes exactly when either does.
  const conversations = useKeysetList(
    true,
    'conversations',
    fetchConversations,
    'Could not load conversations.',
    conversationListRefreshTick + (refreshToken ?? 0),
  );

  // #383: this device's durable per-conversation unread, merged against the server count
  // for the badge. Rebuilt whenever the visible list or the bound vault loader changes;
  // no vault-backed sender means `conversationUnread` is undefined and the map stays
  // empty (server count used as-is).
  const [localUnreadMap, setLocalUnreadMap] = useState<ReadonlyMap<string, number>>(new Map());
  useEffect(() => {
    if (conversationUnread === undefined) return;
    let cancelled = false;
    void (async () => {
      const entries = new Map<string, number>();
      for (const conversation of conversations.items) {
        if (cancelled) return;
        try {
          const count = await conversationUnread(conversation.id);
          if (count !== undefined) entries.set(conversation.id, count);
        } catch {
          // A failed/absent vault is not a statement about unread — the server count for
          // that conversation is used as-is.
        }
      }
      if (cancelled) return;
      setLocalUnreadMap(entries);
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationUnread, conversations.items]);

  // P19-017 / ADR 0032: the conversation list refreshes on `conversationListPollMs`
  // while it is the visible, focused list — not while a thread or the transcript
  // overlay is open on top of it, and not while another screen owns the terminal
  // (`isActive` false). Same shape as the mailbox/security polls below: fire once
  // immediately, then on an interval, clear on cleanup.
  const listPollActive = isActive && view === 'list';
  useEffect(() => {
    if (!listPollActive) return;
    const timer = setInterval(
      () => setConversationListRefreshTick((tick) => tick + 1),
      Math.max(250, conversationListPollMs),
    );
    return () => {
      clearInterval(timer);
    };
  }, [listPollActive, conversationListPollMs]);

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
    // `refreshToken` (P19-016's `Ctrl+R`) re-runs this on demand; the thread has no
    // periodic conversation-state poll of its own, so a manual refresh is the only way
    // to pick up a membership/mode change without closing and reopening the thread.
  }, [api, conversationId, view, refreshToken]);

  // --- peer security re-checks (P13-010 interstitials) ----------------------
  // While an end-to-end thread is open, compare the peer's identity root and device
  // roster against what was seen when the thread opened (ADR 0020 §2/§3): a changed
  // root — or the server's own `identity_changed_since_acknowledged` flag — pauses
  // sends until the viewer acknowledges it. Never resolves silently.
  const e2eeThreadOpen =
    view === 'thread' && isE2eeConversation(selectedConversation) && conversationId !== '';
  const peerId = peerActorIdOf(selectedConversation, viewerActorId);
  const canCheckSecurity =
    e2eeThreadOpen &&
    peerId !== undefined &&
    api.getIdentityRoot !== undefined &&
    api.getDeviceRoster !== undefined;

  useEffect(() => {
    if (
      !canCheckSecurity ||
      peerId === undefined ||
      api.getIdentityRoot === undefined ||
      api.getDeviceRoster === undefined
    ) {
      return;
    }
    let cancelled = false;
    async function check(): Promise<void> {
      try {
        const [rootResponse, rosterResponse] = await Promise.all([
          api.getIdentityRoot?.({ actorId: peerId ?? '' }),
          api.getDeviceRoster?.({ actorId: peerId ?? '' }),
        ]);
        if (cancelled) return;
        const root = rootResponse?.identityRoot;
        const roster = rosterResponse?.roster;
        const observed: PeerSecurityBaseline = {
          actorId: peerId ?? '',
          rootGeneration: root?.generation ?? 0,
          rootPublicKeyHex: toHex(root?.publicKey),
          rosterSequence: String(roster?.sequence ?? 0n),
          rosterDigestHex: toHex(roster?.digest),
        };
        const baseline = peerBaseline.current;
        if (baseline === undefined) {
          peerBaseline.current = observed;
          setPeerSecurity({ status: 'ok' });
          return;
        }
        if (
          baseline.rootPublicKeyHex !== observed.rootPublicKeyHex ||
          baseline.rootGeneration !== observed.rootGeneration ||
          rootResponse?.identityChangedSinceAcknowledged === true
        ) {
          setPeerSecurity({ status: 'identityChanged' });
          return;
        }
        if (
          baseline.rosterSequence !== observed.rosterSequence ||
          baseline.rosterDigestHex !== observed.rosterDigestHex
        ) {
          setPeerSecurity({ status: 'rosterChanged' });
          return;
        }
        setPeerSecurity({ status: 'ok' });
      } catch {
        // A failed re-check is never treated as "all clear": keep whatever the last
        // successful check concluded. The next poll retries.
      }
    }
    void check();
    const timer = setInterval(() => void check(), Math.max(250, securityPollMs));
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [api, canCheckSecurity, peerId, securityPollMs]);

  // Leaving an E2EE thread ends the peer watch: the baseline and verdict reset so the
  // next open re-baselines deliberately (the copy says acknowledging means closing and
  // reopening). Called from the exit handlers — never during render.
  function closeE2eeThreadWatch(): void {
    peerBaseline.current = undefined;
    setPeerSecurity({ status: 'ok' });
  }

  // --- end-to-end mailbox polling (B-101) ------------------------------------
  // While an end-to-end thread is open, drain the device mailbox on an interval. The
  // callback decrypts, commits receive state durably, and acknowledges; this effect
  // only merges validated rows into the thread view. Failures retry on the next tick
  // and never clear what earlier ticks rendered.
  useEffect(() => {
    if (!e2eeThreadOpen || conversationId === '' || receiveE2ee === undefined) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // P19-027 / issue #384: bounded backoff on consecutive transient drain failures so a
    // sustained outage does not hammer `ListMailboxEnvelopes` at the fixed cadence. A
    // success resets the count, collapsing the gap straight back to the base interval.
    let consecutiveFailures = 0;
    async function poll(): Promise<void> {
      if (cancelled) return;
      try {
        const rows = await receiveE2ee?.(conversationId);
        if (cancelled) return;
        if (rows !== undefined && rows.length > 0) {
          setE2eeRows((current) => {
            const seen = new Set(current.map((row) => row.id));
            const fresh = rows.filter((row) => !seen.has(row.id));
            return fresh.length === 0 ? current : [...current, ...fresh];
          });
        }
        // A successful drain collapses the backoff straight back to the base interval.
        consecutiveFailures = 0;
      } catch {
        // Transient poll failures are invisible beyond the next tick's retry; nothing
        // about a failed poll may be mistaken for "no messages". Each failure widens the
        // gap up to the capped ceiling (P19-027 / issue #384).
        consecutiveFailures += 1;
      }
      if (cancelled) return;
      const delay = nextPollDelayMs(
        consecutiveFailures,
        Math.max(250, mailPollMs),
        TUI_POLL_BACKOFF_MAX_MS,
      );
      timer = setTimeout(() => void poll(), delay);
    }
    void poll();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
    // `refreshToken` (`Ctrl+R`, P19-016) restarts this effect: an immediate drain plus a
    // fresh interval, on top of the normal `mailPollMs` cadence rather than instead of it.
  }, [e2eeThreadOpen, conversationId, receiveE2ee, mailPollMs, refreshToken]);

  function loadTranscript(id: string): void {
    closeE2eeThreadWatch();
    setView('transcript');
    setTranscript({ status: 'loading' });
    if (api.verifyGroupControlEvents !== undefined) {
      // B-101 seam: verify every event's device signature against the signer's
      // published, chain-verified device key before anything reaches the screen.
      api
        .verifyGroupControlEvents({ conversationId: id })
        .then((verdict) => {
          setTranscript({
            status: 'shown',
            rows: verdict.rows,
            allVerified: verdict.allVerified,
          });
        })
        .catch(() => {
          setTranscript({
            status: 'error',
            message: 'Could not load the membership history for this conversation.',
          });
        });
      return;
    }
    if (api.listE2eeGroupControlEvents === undefined) {
      setTranscript({ status: 'hidden' });
      return;
    }
    api
      .listE2eeGroupControlEvents({ conversationId: id, afterEpoch: 0n, limit: 50 })
      .then((response) => {
        setTranscript({
          status: 'shown',
          rows: response.events.map((event) => ({
            epoch: event.epoch,
            change:
              event.change === E2EE_GROUP_CHANGE_KIND.ADDED
                ? 'ADDED'
                : event.change === E2EE_GROUP_CHANGE_KIND.REMOVED
                  ? 'REMOVED'
                  : 'UNKNOWN',
            subjectActorId: event.subjectActorId,
          })),
          allVerified: undefined,
        });
      })
      .catch((error: unknown) => {
        setTranscript({
          status: 'error',
          message: isMembershipConflict(error)
            ? MEMBERSHIP_CONFLICT_COPY
            : 'Could not load the membership history for this conversation.',
        });
      });
  }

  const visibleCount = Math.max(3, rows - 4);
  const effectiveListRow = Math.min(selectedListRow, Math.max(conversations.items.length - 1, 0));

  function openConversation(conversation: Conversation): void {
    setSelectedConversation(conversation);
    setConversationId(conversation.id);
    setDraft('');
    setPendingMessages([]);
    setThreadError(undefined);
    setE2eeRows([]);
    // Reopening re-baselines the security checks on purpose — acknowledging a change
    // interstitial is exactly this action (the copy says so), and it must not be
    // possible to acknowledge without the fetch that proves what is true now.
    peerBaseline.current = undefined;
    setPeerSecurity({ status: 'ok' });
    setTranscript({ status: 'hidden' });
    setView('thread');
  }

  function backToList(): void {
    closeE2eeThreadWatch();
    setView('list');
    setConversationId('');
    setSelectedConversation(undefined);
    setDraft('');
    setPendingMessages([]);
    setThreadError(undefined);
    setE2eeRows([]);
    setTranscript({ status: 'hidden' });
  }

  /**
   * Every reachable conversation is end-to-end (ADR 0030/B-095 retired the plaintext
   * `SendMessage` RPC this used to fall back to). Sending never rides a plaintext path —
   * not as a fallback, not "just this once" (ADR 0020 §1.2) — it goes through the
   * shell's vault-backed pipeline or it does not go out at all.
   */
  async function sendDraft(): Promise<void> {
    const body = draft;
    if (body.trim() === '' || conversationId === '' || sending) return;
    if (!isE2eeConversation(selectedConversation)) {
      setThreadError('This conversation could not be sent to.');
      return;
    }
    if (e2eeVaultFault !== undefined) {
      setThreadError(`${VAULT_FAULT_COPY[e2eeVaultFault]} ${VAULT_FAULT_HINT}`);
      return;
    }
    if (peerSecurity.status === 'identityChanged') {
      setThreadError(IDENTITY_CHANGED_COPY);
      return;
    }
    if (peerSecurity.status === 'rosterChanged') {
      setThreadError(ROSTER_CHANGED_COPY);
      return;
    }
    if (sendE2ee === undefined) {
      setThreadError(E2EE_SEND_UNAVAILABLE_COPY);
      return;
    }
    const clientRequestId = createRequestId();
    setSending(true);
    setThreadError(undefined);
    setDraft('');
    setPendingMessages((current) => [...current, { id: clientRequestId, body }]);
    try {
      const sentRow = await sendE2ee(conversationId, body);
      setPendingMessages((current) => current.filter((message) => message.id !== clientRequestId));
      // A device is never in its own fanout (issue #332), so no mailbox drain will ever
      // return this message: the row the send pipeline stored in the vault is the only
      // copy. Dropping the pending row without adopting it would make the viewer's own
      // text vanish the instant the send succeeded.
      if (sentRow !== undefined) {
        setE2eeRows((current) =>
          current.some((row) => row.id === sentRow.id) ? current : [...current, sentRow],
        );
      }
    } catch (error) {
      setPendingMessages((current) => current.filter((message) => message.id !== clientRequestId));
      setDraft(body);
      // No enrolled device (the TUI has no enrollment flow yet — B-101 leaves the
      // pipeline wired but identity-less): say exactly that, not "message lost".
      setThreadError(
        error instanceof E2eeNotEnrolledError
          ? E2EE_SEND_UNAVAILABLE_COPY
          : 'Message was not sent. Your draft is still here.',
      );
    } finally {
      setSending(false);
    }
  }

  useInput(
    (input, key) => {
      if (key.escape) {
        if (view === 'thread') backToList();
        else if (view === 'transcript') {
          // The transcript is a list-level overlay of one conversation; Esc lands on
          // that conversation's row again.
          backToList();
        } else onBack?.();
        return;
      }

      if (view === 'list') {
        if ((input === 'n' || input === ' ') && conversations.hasMore) {
          conversations.loadMore();
          return;
        }
        // Membership transcript takes precedence over list-movement's "jump to bottom":
        // an E2EE row's G opens the signed transcript; other rows keep movement.
        if (input === 'G') {
          const conversation = conversations.items[effectiveListRow];
          if (conversation !== undefined && isE2eeConversation(conversation)) {
            loadTranscript(conversation.id);
            return;
          }
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
            const peer = peerActorIdOf(conversation, viewerActorId);
            if (peer !== undefined) onOpenSafetyNumber(peer);
          }
          return;
        }
        if (key.return) {
          const conversation = conversations.items[effectiveListRow];
          if (conversation !== undefined) openConversation(conversation);
        }
        return;
      }

      if (view === 'transcript') {
        // Read-only overlay: every key other than Esc is ignored until the viewer backs out.
        return;
      }

      // Safety numbers and the membership transcript live on the *list* level, not in
      // the thread: the thread owns every printable key for drafting, and stealing
      // letters there would corrupt drafts. One Esc away keeps them unambiguous.
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

  const retentionCopy = retentionCopyFor(dmRetentionDays);
  // Mode labels are immutable facts of the conversation (ADR 0020 §11): read from
  // `securityMode`, worded by the domain's disclosure rules, never by local assumption.
  const threadDomainMode =
    selectedConversation?.securityMode === undefined
      ? undefined
      : domainModeOf(selectedConversation.securityMode);
  const threadIsE2ee =
    threadDomainMode !== undefined && mayDescribeAsEndToEndEncrypted(threadDomainMode);
  const threadDisclosure =
    threadIsE2ee && threadDomainMode !== undefined
      ? requiredConversationDisclosure(threadDomainMode)
      : undefined;

  const peerVerified = peerId !== undefined && (verifiedPeers?.has(peerId) ?? false);

  return (
    <Box flexDirection="column">
      {e2eeVaultFault === undefined ? null : (
        <Box flexDirection="column">
          <Text color={theme.error} wrap="wrap">
            {VAULT_FAULT_COPY[e2eeVaultFault]}
          </Text>
          <Text color={theme.muted} wrap="wrap">
            {VAULT_FAULT_HINT}
          </Text>
        </Box>
      )}
      <Text color={theme.accent}>Messages</Text>
      {retentionCopy === undefined ? null : <Text color={theme.muted}>{retentionCopy}</Text>}

      {view === 'list' ? (
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.muted} wrap="wrap">
            {dmFreshnessCopy('list', conversationListPollMs)}
          </Text>
          {conversations.error === undefined ? null : (
            <Text color={theme.error}>{conversations.error}</Text>
          )}
          {conversations.loading ? <Loading label="Loading conversations" /> : null}
          {/* P19-017: a failed poll must never be mistaken for a genuinely empty
              inbox — the error line above already says a fetch failed, so this only
              renders once loading has finished, nothing failed, and the list is
              actually empty. */}
          {!conversations.loading &&
          conversations.error === undefined &&
          conversations.items.length === 0 ? (
            <Text color={theme.muted}>No conversations yet.</Text>
          ) : null}
          {conversations.items.map((conversation, index) => {
            const unreadCount = readOverrideIds.has(conversation.id)
              ? 0
              : mergeUnread(conversation.unreadCount, localUnreadMap.get(conversation.id));
            return (
              <Text
                key={conversation.id}
                color={isActive && index === effectiveListRow ? theme.accent : theme.text}
                bold={isActive && index === effectiveListRow}
              >
                {isActive && index === effectiveListRow ? '› ' : '  '}
                {conversationLabel(conversation, viewerActorId)}
                {isE2eeConversation(conversation) ? ' [E2EE]' : ''}
                {unreadCount > 0 ? ` · ${String(unreadCount)} unread` : ''}
              </Text>
            );
          })}
          {conversations.loadingMore ? <Loading label="Loading more" /> : null}
          <Text color={theme.muted}>
            Enter open · n / space more · s safety number · G membership · Esc back
          </Text>
        </Box>
      ) : null}

      {view === 'thread' ? (
        <Box marginTop={1} flexDirection="column">
          <Text bold>
            {selectedConversation === undefined
              ? sanitizeForTerminal(conversationId)
              : `${conversationLabel(selectedConversation, viewerActorId)}${
                  isE2eeConversation(selectedConversation) ? ' [E2EE]' : ''
                }`}
          </Text>
          {threadDisclosure === undefined ? null : <Text color={theme.ok}>{threadDisclosure}</Text>}
          <Text color={theme.muted} wrap="wrap">
            {dmFreshnessCopy('thread', mailPollMs)}
          </Text>
          {threadIsE2ee ? (
            <Text color={peerVerified ? theme.ok : theme.warn}>
              {peerVerified
                ? 'Safety number verified.'
                : 'Safety number not verified — press s to compare it.'}
            </Text>
          ) : null}
          {peerSecurity.status === 'identityChanged' ? (
            <Text color={theme.error} wrap="wrap">
              ⚠ {IDENTITY_CHANGED_COPY}
            </Text>
          ) : null}
          {peerSecurity.status === 'rosterChanged' ? (
            <Text color={theme.error} wrap="wrap">
              ⚠ {ROSTER_CHANGED_COPY}
            </Text>
          ) : null}
          {threadError === undefined ? null : (
            <Text color={theme.error}>{threadError} Enter retries with the same text.</Text>
          )}
          {pendingMessages.map((message) => (
            <Text key={message.id}>
              <Text color={theme.muted}>{glyph('pending', glyphSet)} you: </Text>
              {sanitizeForTerminal(message.body)} <Text color={theme.muted}>· sending</Text>
            </Text>
          ))}
          {e2eeRows.map((row) => {
            if (row.kind === 'message') {
              return (
                <Text key={row.id}>
                  <Text color={theme.muted}>{sanitizeForTerminal(row.senderLabel)}: </Text>
                  {sanitizeForTerminal(row.body)}
                  {row.deliveryFailed === true ? (
                    <Text color={theme.error}> · not delivered</Text>
                  ) : null}
                </Text>
              );
            }
            if (row.kind === 'unverifiable') {
              return (
                <Text key={row.id} color={theme.muted} wrap="wrap">
                  {unverifiableMessageCopy(sanitizeForTerminal(row.senderLabel))}
                </Text>
              );
            }
            if (row.kind === 'undisplayable') {
              return (
                <Text key={row.id} color={theme.muted} wrap="wrap">
                  A delivered message could not be displayed.
                </Text>
              );
            }
            if (row.kind === 'quarantined') {
              return (
                <Text key={row.id} color={theme.muted} wrap="wrap">
                  {E2EE_QUARANTINED_MESSAGE_COPY}
                </Text>
              );
            }
            return (
              <Box key={row.id} flexDirection="column">
                <Text color={theme.muted} wrap="wrap">
                  Re-delivered history from {sanitizeForTerminal(row.fromLabel)} — provenance not
                  independently verified.
                </Text>
                {row.entries.map((entry, index) => (
                  <Text key={`${row.id}:${String(index)}`}>
                    {'  '}
                    <Text color={theme.muted}>{sanitizeForTerminal(entry.senderLabel)}: </Text>
                    {sanitizeForTerminal(entry.body)}
                  </Text>
                ))}
              </Box>
            );
          })}
          <Box marginTop={1}>
            <Text color={theme.accent}>Draft: </Text>
            <Text>{draft}</Text>
          </Box>
          <Text color={theme.muted}>
            Enter send · Backspace edit · Esc conversations (then s verifies)
          </Text>
        </Box>
      ) : null}

      {view === 'transcript' ? (
        <Box marginTop={1} flexDirection="column">
          <Text bold>Membership changes</Text>
          {transcript.status === 'loading' ? <Loading label="Loading membership history" /> : null}
          {transcript.status === 'error' ? (
            <Text color={theme.error} wrap="wrap">
              {transcript.message}
            </Text>
          ) : null}
          {transcript.status === 'shown' && transcript.rows.length === 0 ? (
            <Text color={theme.muted}>
              No membership changes yet — everyone who was in at creation is still in.
            </Text>
          ) : null}
          {transcript.status === 'shown' && transcript.allVerified !== undefined ? (
            <Text color={transcript.allVerified ? theme.ok : theme.warn} wrap="wrap">
              {transcript.allVerified
                ? 'Every membership event was signed by a member device; all signatures verified.'
                : 'Some membership events could not be signature-verified against published device keys.'}
            </Text>
          ) : null}
          {transcript.status === 'shown'
            ? transcript.rows.map((row) => (
                <Text key={`${row.epoch}`}>
                  epoch {row.epoch.toString()} — {row.change}{' '}
                  {sanitizeForTerminal(row.subjectActorId)}
                  {row.signatureVerified === undefined ? null : (
                    <Text color={row.signatureVerified ? theme.ok : theme.error}>
                      {row.signatureVerified ? ' · signature verified' : ' · SIGNATURE UNVERIFIED'}
                    </Text>
                  )}
                </Text>
              ))
            : null}
          <Text color={theme.muted}>Esc back to conversation</Text>
        </Box>
      ) : null}
    </Box>
  );
}

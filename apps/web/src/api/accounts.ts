import { create, fromJson, toJson, type JsonValue } from '@bufbuild/protobuf';
import type { StoredSession } from '@patches/client';
import { ActorSchema, type Actor } from '@patches/proto/es';

/**
 * Client-side multi-account registry (#345) — lets a signed-in user hold several locally
 * saved accounts for the current node and switch between them without re-entering
 * credentials each time, matching the TUI's `AccountsScreen`/`CredentialStore` behaviour.
 *
 * Layered ON TOP of `@patches/client`'s single-slot `SessionManager` (the "active session"
 * holder in `client.ts`): this module only persists *saved* account sessions keyed by
 * `(node origin, userId)` so per-node isolation is preserved (ADR 0016 §5 — a token is
 * bound to the node that issued it), and it never replaces the SDK manager. Switching simply
 * rehydrates the chosen account's tokens into that active slot (via
 * `apps/web/src/api/client.ts`'s `switchToAccount`).
 *
 * Security: what this module **exposes** to the UI (`listAccounts()`) carries only
 * secret-free profile metadata — the access/refresh tokens and the full `Actor` stay private
 * to the registry and are handed out only through the account-keyed `getAccount()` used by
 * the switching path. Token values never cross the module boundary into render code.
 *
 * The full `Actor` is stored (not just a summary) so switching can restore the signed-in UI
 * via `session.ts`'s `setActorSession`; the same `toJson`/`fromJson` pattern `session.ts`
 * uses is required here too — an `Actor` carries `google.protobuf.Timestamp` fields whose
 * `seconds` is a **bigint**, and `JSON.stringify` throws on it (B-041).
 */

/** The node origin this registry keys credentials against (mirrors `client.ts`'s BASE_URL). */
const NODE_ORIGIN = (import.meta.env['VITE_PATCHES_API_BASE'] as string | undefined) ?? '/api';
const STORAGE_KEY = `patches.web.accounts.${NODE_ORIGIN}.v1`;

/** Secret-free profile metadata — the only account data render code ever sees. */
export interface SavedAccountSummary {
  readonly userId: string;
  readonly handle: string;
  readonly displayName: string;
  readonly avatarUrl: string | undefined;
}

interface SavedAccount extends SavedAccountSummary {
  /** Stored to restore the signed-in UI on switch (same B-041-safe shape as `session.ts`). */
  readonly actor: Actor;
  readonly tokens: StoredSession;
}

/** Shape written to `localStorage` — the private, token-carrying record. */
interface StoredEntry {
  userId: string;
  handle: string;
  displayName: string;
  avatarUrl?: string | undefined;
  actor: JsonValue;
  accessToken: string;
  refreshToken: string;
}

type Listener = () => void;

let cache: SavedAccount[] | undefined;
/** Stable reference for `useSyncExternalStore` — replaced only in `persist()`/first load,
 * never re-allocated per call, or React loops forever on a changing snapshot (`session.ts`
 * follows the same stable-reference rule). */
let summaries: SavedAccountSummary[] = [];
let summariesLoaded = false;
const listeners = new Set<Listener>();

/**
 * The saved accounts for the current node as secret-free summaries, returned as a stable
 * array reference until the registry actually changes (required by `useSyncExternalStore`).
 * The backing cache holds the full (token-carrying) records but only metadata is exposed.
 */
export function listAccounts(): SavedAccountSummary[] {
  if (!summariesLoaded) {
    if (cache === undefined) cache = readAll();
    summaries = toSummaries(cache);
    summariesLoaded = true;
  }
  return summaries;
}

function readAll(): SavedAccount[] {
  if (typeof window === 'undefined') return [];
  const accounts: SavedAccount[] = [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) return accounts;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return accounts;
    for (const entry of parsed) {
      const account = parseEntry(entry);
      if (account !== undefined) accounts.push(account);
    }
  } catch {
    // Corrupt/old-shape value — treat as no saved accounts rather than throwing.
    window.localStorage.removeItem(STORAGE_KEY);
  }
  return accounts;
}

function parseEntry(entry: unknown): SavedAccount | undefined {
  if (typeof entry !== 'object' || entry === null) return undefined;
  const record = entry as Record<string, unknown>;
  if (typeof record['userId'] !== 'string' || typeof record['handle'] !== 'string') {
    return undefined;
  }
  if (typeof record['accessToken'] !== 'string' || typeof record['refreshToken'] !== 'string') {
    return undefined;
  }
  try {
    const actor = fromJson(ActorSchema, record['actor'] as JsonValue);
    return {
      userId: record['userId'],
      handle: record['handle'],
      displayName: typeof record['displayName'] === 'string' ? record['displayName'] : '',
      avatarUrl: typeof record['avatarUrl'] === 'string' ? record['avatarUrl'] : undefined,
      actor,
      tokens: {
        accessToken: record['accessToken'],
        refreshToken: record['refreshToken'],
      },
    };
  } catch {
    return undefined;
  }
}

function toSummaries(accounts: readonly SavedAccount[]): SavedAccountSummary[] {
  return accounts.map(({ userId, handle, displayName, avatarUrl }) => ({
    userId,
    handle,
    displayName,
    avatarUrl,
  }));
}

function notify(): void {
  for (const listener of listeners) listener();
}

function persist(accounts: readonly SavedAccount[]): void {
  cache = [...accounts];
  summaries = toSummaries(accounts);
  summariesLoaded = true;
  const entries: StoredEntry[] = accounts.map((account) => ({
    userId: account.userId,
    handle: account.handle,
    displayName: account.displayName,
    ...(account.avatarUrl === undefined ? {} : { avatarUrl: account.avatarUrl }),
    actor: toJson(ActorSchema, create(ActorSchema, account.actor)),
    accessToken: account.tokens.accessToken,
    refreshToken: account.tokens.refreshToken,
  }));
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

/**
 * Registers (or refreshes) a saved account. Called on every successful login/link via
 * `client.ts`'s `establishSession`, so any account the user signs into is remembered here.
 */
export function saveAccount(actor: Actor, tokens: StoredSession): void {
  if (typeof window === 'undefined' || actor.id === '') return;
  const accounts = readAll();
  const existing = accounts.find((account) => account.userId === actor.id);
  const updated: SavedAccount = {
    userId: actor.id,
    handle: actor.handle,
    displayName: actor.displayName,
    avatarUrl: actor.avatar?.url,
    actor,
    tokens,
  };
  const next =
    existing === undefined
      ? [...accounts, updated]
      : accounts.map((a) => (a.userId === actor.id ? updated : a));
  persist(next);
  notify();
}

/** Removes a saved account from the registry (its tokens are discarded). */
export function removeAccount(userId: string): void {
  if (typeof window === 'undefined') return;
  const next = readAll().filter((account) => account.userId !== userId);
  persist(next);
  notify();
}

/**
 * The private, token-carrying lookup used only by the switching path in `client.ts`.
 * Returns `undefined` when no account is saved under that id for this node.
 */
export function getAccount(userId: string): { actor: Actor; tokens: StoredSession } | undefined {
  const account = readAll().find((entry) => entry.userId === userId);
  if (account === undefined) return undefined;
  return { actor: account.actor, tokens: account.tokens };
}

export function subscribeAccounts(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

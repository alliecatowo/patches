import type {
  GetConversationRequest,
  GetConversationResponse,
  ListConversationsRequest,
  ListConversationsResponse,
  MarkConversationReadRequest,
  MarkConversationReadResponse,
} from '../api/wire/types.js';

import { present } from '../api/present.js';
import { describeGrpcError } from '../api/errors.js';
import { type PatchesApi } from '../api/client.js';
import { SessionManager } from '../auth/session.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { createApi, openCredentialStore } from './auth-shared.js';
import type { CliIo } from './io.js';

/**
 * B-096: every remaining conversation is `E2EE_V1` (ADR 0030/B-095 retired the legacy
 * server-visible mode). This is accurate, unlike the legacy §183.1 notice it replaces —
 * see `requiredConversationDisclosure('E2EE_V1')` in `@patches/domain`, which this
 * mirrors rather than imports to keep the CLI's dependency surface small.
 */
const DM_NOTICE =
  'End-to-end encrypted. This node cannot read these messages, but it can see who you message and when.';

/**
 * `patches dm send`/`read` cannot reach an end-to-end conversation's content: the
 * decryption keys live only in the interactive app's local vault, and the server no
 * longer carries a plaintext message surface for any conversation to fall back to.
 */
const E2EE_REFUSAL =
  'This conversation uses end-to-end encryption, whose keys `patches dm` does not hold, ' +
  'so it cannot read or write here. Use the interactive app instead — its DM screen composes ' +
  'and decrypts these messages.';

const USAGE = `Usage: patches dm <list|send|read> [options]

  patches dm list [--cursor <cursor>] [--limit <count>]
  patches dm send <conversation-id> <message>
  patches dm read <conversation-id>

Options:
  --cursor <cursor>              continue from an opaque keyset cursor
  --limit <count>                rows to request (1–100; default 20)
  --node, --server <host:port>   node to act against
  -h, --help                     show this message
`;

export interface DmCommandApi {
  listConversations(request: ListConversationsRequest): Promise<ListConversationsResponse>;
  getConversation(request: GetConversationRequest): Promise<GetConversationResponse>;
  markConversationRead(request: MarkConversationReadRequest): Promise<MarkConversationReadResponse>;
}

export interface DmCommandSession {
  api: DmCommandApi;
  close(): void;
}

export interface DmDeps {
  io: CliIo;
  env: NodeJS.ProcessEnv;
  target: string;
  insecure: boolean;
  /** Test/shell seam; production restores the current account and opens gRPC. */
  openSession?: (() => Promise<DmCommandSession | undefined>) | undefined;
  createRequestId?: (() => string) | undefined;
}

interface PageFlags {
  cursor: string;
  limit: number;
  help: boolean;
}

function parsePageFlags(rest: readonly string[]): PageFlags | { error: string } {
  const flags: PageFlags = { cursor: '', limit: 20, help: false };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === '-h' || argument === '--help') {
      flags.help = true;
      continue;
    }
    if (argument !== '--cursor' && argument !== '--limit') {
      return { error: `Unknown option: ${argument}` };
    }
    const value = rest[index + 1];
    if (value === undefined) return { error: `${argument} needs a value.` };
    index += 1;
    if (argument === '--cursor') {
      flags.cursor = value;
      continue;
    }
    const limit = Number(value);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return { error: '--limit must be a whole number from 1 to 100.' };
    }
    flags.limit = limit;
  }
  return flags;
}

function commandApi(api: PatchesApi, accessToken: string): DmCommandApi {
  return {
    listConversations: (request) => api.listConversations(request, accessToken),
    getConversation: (request) => api.getConversation(request, accessToken),
    markConversationRead: (request) => api.markConversationRead(request, accessToken),
  };
}

async function openCurrentSession(deps: DmDeps): Promise<DmCommandSession | undefined> {
  if (deps.openSession !== undefined) return deps.openSession();

  const sessionApi = createApi(deps.target, deps.insecure);
  try {
    const store = await openCredentialStore(deps.io, deps.env);
    const manager = new SessionManager({ api: sessionApi, store, nodeOrigin: deps.target });
    const session = await manager.restore();
    if (session === undefined) {
      deps.io.stderr(`Not signed in on ${deps.target}. Run \`patches login\`.\n`);
      sessionApi.close();
      return undefined;
    }
    const accessToken = await manager.ensureAccessToken();
    return {
      api: commandApi(sessionApi, accessToken),
      close: () => {
        sessionApi.close();
      },
    };
  } catch (error) {
    sessionApi.close();
    throw error;
  }
}

function oneLine(value: string): string {
  return sanitizeForTerminal(value).replaceAll('\n', ' ');
}

function actorLabel(actor: { handle: string; displayName: string } | null | undefined): string {
  if (!present(actor)) return 'unknown actor';
  const handle = oneLine(actor.handle);
  const displayName = oneLine(actor.displayName);
  return displayName === '' ? `@${handle}` : `${displayName} (@${handle})`;
}

function reportDmError(io: CliIo, error: unknown, target: string): void {
  const friendly = describeGrpcError(error, target);
  io.stderr(`${oneLine(friendly.title)}\n`);
  if (friendly.hint !== '') io.stderr(`${oneLine(friendly.hint)}\n`);
}

function conversationActors(
  conversation: ListConversationsResponse['conversations'][number],
): string {
  const actors = conversation.members
    .filter((member) => !present(member.leftAt))
    .map((member) => actorLabel(member.actor));
  return actors.length === 0 ? 'no active members' : actors.join(', ');
}

async function withSession(
  deps: DmDeps,
  operation: (session: DmCommandSession) => Promise<void | number>,
): Promise<number> {
  let session: DmCommandSession | undefined;
  try {
    session = await openCurrentSession(deps);
    if (session === undefined) return 1;
    deps.io.stdout(`${DM_NOTICE}\n`);
    // An operation may return its own exit code (e.g. a local pre-check refusal); absent
    // one, completing normally is success.
    const outcome = await operation(session);
    return outcome ?? 0;
  } catch (error) {
    reportDmError(deps.io, error, deps.target);
    return 1;
  } finally {
    session?.close();
  }
}

async function runList(rest: readonly string[], deps: DmDeps): Promise<number> {
  const flags = parsePageFlags(rest);
  if ('error' in flags) {
    deps.io.stderr(`${flags.error}\n\n${USAGE}`);
    return 1;
  }
  if (flags.help) {
    deps.io.stdout(USAGE);
    return 0;
  }
  return withSession(deps, async ({ api }) => {
    const response = await api.listConversations({ cursor: flags.cursor, limit: flags.limit });
    if (response.conversations.length === 0) {
      deps.io.stdout('No conversations.\n');
    }
    for (const conversation of response.conversations) {
      const unread =
        conversation.unreadCount === 0 ? '' : `\t${String(conversation.unreadCount)} unread`;
      deps.io.stdout(`${oneLine(conversation.id)}\t${conversationActors(conversation)}${unread}\n`);
    }
    if (response.page?.hasMore === true) {
      deps.io.stdout(`next cursor: ${oneLine(response.page.nextCursor)}\n`);
    }
  });
}

/**
 * `send`/`read` never reach the network: every conversation is `E2EE_V1`, and this
 * headless command holds no decryption keys (those live only in the interactive app's
 * local vault). Refusing locally is more honest than making a request that would either
 * fail opaquely or — worse — succeed and leave plaintext outside the vault.
 */
function refuseHeadlessContentAccess(rest: readonly string[], deps: DmDeps): number {
  if (rest[0] === '-h' || rest[0] === '--help') {
    deps.io.stdout(USAGE);
    return 0;
  }
  deps.io.stderr(`${E2EE_REFUSAL}\n`);
  return 1;
}

/** Headless conversation-listing counterpart of the interactive screen. */
export async function runDm(rest: readonly string[], deps: DmDeps): Promise<number> {
  const [subcommand, ...remaining] = rest;
  if (subcommand === '-h' || subcommand === '--help') {
    deps.io.stdout(USAGE);
    return 0;
  }
  if (subcommand === undefined) {
    deps.io.stderr(`A subcommand is required.\n\n${USAGE}`);
    return 1;
  }
  if (subcommand === 'list') return runList(remaining, deps);
  if (subcommand === 'send') return refuseHeadlessContentAccess(remaining, deps);
  if (subcommand === 'read') return refuseHeadlessContentAccess(remaining, deps);
  deps.io.stderr(`Unknown dm subcommand: ${subcommand}\n\n${USAGE}`);
  return 1;
}

import { randomUUID } from 'node:crypto';

import { credentials, Metadata, type ServiceError } from '@grpc/grpc-js';
import {
  createDirectMessageClient,
  DEADLINES_MS,
  METADATA_KEYS,
  type DirectMessageGrpcClient,
  type GetConversationRequest,
  type GetConversationResponse,
  type GrpcUnaryCall,
  type ListConversationsRequest,
  type ListConversationsResponse,
  type ListMessageRequestsRequest,
  type ListMessageRequestsResponse,
  type ListMessagesRequest,
  type ListMessagesResponse,
  type MarkConversationReadRequest,
  type MarkConversationReadResponse,
  type RespondToMessageRequestRequest,
  type RespondToMessageRequestResponse,
  type SendMessageRequest,
  type SendMessageResponse,
} from '@patches/proto';

import { present } from '../api/present.js';
import { describeGrpcError } from '../api/errors.js';
import { SessionManager } from '../auth/session.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { CLIENT_NAME, TUI_VERSION } from '../version.js';
import { createApi, openCredentialStore } from './auth-shared.js';
import type { CliIo } from './io.js';

const DM_NOTICE = "Not end-to-end encrypted — this node's operators can read these messages.";

const USAGE = `Usage: patches dm <list|send|read|requests> [options]

  patches dm list [--cursor <cursor>] [--limit <count>]
  patches dm send <conversation-id> <message>
  patches dm read <conversation-id> [--cursor <cursor>] [--limit <count>]
  patches dm requests [--cursor <cursor>] [--limit <count>]
  patches dm requests accept <request-id>
  patches dm requests decline <request-id>

Options:
  --cursor <cursor>              continue from an opaque keyset cursor
  --limit <count>                rows to request (1–100; default 20)
  --node, --server <host:port>   node to act against
  -h, --help                     show this message
`;

export interface DmCommandApi {
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

function metadata(accessToken: string): Metadata {
  const result = new Metadata();
  result.set(METADATA_KEYS.requestId, randomUUID());
  result.set(METADATA_KEYS.client, CLIENT_NAME);
  result.set(METADATA_KEYS.clientVersion, TUI_VERSION);
  result.set(METADATA_KEYS.authorization, `Bearer ${accessToken}`);
  return result;
}

function unary<Request, Response>(
  method: GrpcUnaryCall<Request, Response>,
  request: Request,
  accessToken: string,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    method(
      request,
      metadata(accessToken),
      { deadline: new Date(Date.now() + DEADLINES_MS.unary) },
      (error: ServiceError | null, response?: Response) => {
        if (error !== null) {
          reject(error);
          return;
        }
        if (response === undefined) {
          reject(new Error('The server replied with nothing at all.'));
          return;
        }
        resolve(response);
      },
    );
  });
}

function commandApi(client: DirectMessageGrpcClient, accessToken: string): DmCommandApi {
  return {
    listConversations: (request) =>
      unary(client.listConversations.bind(client), request, accessToken),
    getConversation: (request) => unary(client.getConversation.bind(client), request, accessToken),
    listMessages: (request) => unary(client.listMessages.bind(client), request, accessToken),
    sendMessage: (request) => unary(client.sendMessage.bind(client), request, accessToken),
    markConversationRead: (request) =>
      unary(client.markConversationRead.bind(client), request, accessToken),
    listMessageRequests: (request) =>
      unary(client.listMessageRequests.bind(client), request, accessToken),
    respondToMessageRequest: (request) =>
      unary(client.respondToMessageRequest.bind(client), request, accessToken),
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
    const channelCredentials = deps.insecure
      ? credentials.createInsecure()
      : credentials.createSsl();
    const client = createDirectMessageClient(deps.target, channelCredentials);
    return {
      api: commandApi(client, accessToken),
      close: () => {
        client.close();
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
  operation: (session: DmCommandSession) => Promise<void>,
): Promise<number> {
  let session: DmCommandSession | undefined;
  try {
    session = await openCurrentSession(deps);
    if (session === undefined) return 1;
    deps.io.stdout(`${DM_NOTICE}\n`);
    await operation(session);
    return 0;
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

async function runSend(rest: readonly string[], deps: DmDeps): Promise<number> {
  if (rest[0] === '-h' || rest[0] === '--help') {
    deps.io.stdout(USAGE);
    return 0;
  }
  const [conversationId, ...bodyParts] = rest;
  const body = bodyParts.join(' ').trim();
  if (conversationId === undefined || conversationId === '' || body === '') {
    deps.io.stderr(`A conversation id and message are required.\n\n${USAGE}`);
    return 1;
  }
  if (Array.from(body).length > 2_000) {
    deps.io.stderr('A message can be at most 2,000 characters.\n');
    return 1;
  }
  return withSession(deps, async ({ api }) => {
    const response = await api.sendMessage({
      clientRequestId: deps.createRequestId?.() ?? randomUUID(),
      conversationId,
      body,
    });
    deps.io.stdout(
      present(response.message) ? `Sent ${oneLine(response.message.id)}.\n` : 'Message sent.\n',
    );
  });
}

async function runRead(rest: readonly string[], deps: DmDeps): Promise<number> {
  const [conversationId, ...flagArgs] = rest;
  if (conversationId === '-h' || conversationId === '--help') {
    deps.io.stdout(USAGE);
    return 0;
  }
  if (conversationId === undefined || conversationId === '') {
    deps.io.stderr(`A conversation id is required.\n\n${USAGE}`);
    return 1;
  }
  const flags = parsePageFlags(flagArgs);
  if ('error' in flags) {
    deps.io.stderr(`${flags.error}\n\n${USAGE}`);
    return 1;
  }
  return withSession(deps, async ({ api }) => {
    const conversation = await api.getConversation({ id: conversationId });
    if (!present(conversation.conversation)) {
      throw new Error('That conversation no longer exists.');
    }
    const response = await api.listMessages({
      conversationId,
      cursor: flags.cursor,
      limit: flags.limit,
    });
    for (const message of [...response.messages].reverse()) {
      const body = present(message.deletedAt) ? '[deleted]' : oneLine(message.body);
      deps.io.stdout(`${actorLabel(message.sender)}\t${body}\n`);
    }
    if (response.messages.length === 0) deps.io.stdout('No messages.\n');
    const newest = response.messages[0];
    if (flags.cursor === '' && newest !== undefined) {
      await api.markConversationRead({ conversationId, throughMessageId: newest.id });
    }
    if (response.page?.hasMore === true) {
      deps.io.stdout(`next cursor: ${oneLine(response.page.nextCursor)}\n`);
    }
  });
}

async function runRequests(rest: readonly string[], deps: DmDeps): Promise<number> {
  const [action, requestId, ...extra] = rest;
  if (action === 'accept' || action === 'decline') {
    if (requestId === undefined || requestId === '' || extra.length > 0) {
      deps.io.stderr(`A single request id is required.\n\n${USAGE}`);
      return 1;
    }
    return withSession(deps, async ({ api }) => {
      await api.respondToMessageRequest({ id: requestId, accept: action === 'accept' });
      deps.io.stdout(
        `${action === 'accept' ? 'Accepted' : 'Declined'} request ${oneLine(requestId)}.\n`,
      );
    });
  }

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
    const response = await api.listMessageRequests({ cursor: flags.cursor, limit: flags.limit });
    if (response.requests.length === 0) deps.io.stdout('No pending requests.\n');
    for (const request of response.requests) {
      deps.io.stdout(
        `${oneLine(request.id)}\t${actorLabel(request.sender)}\t${oneLine(request.body)}\n`,
      );
    }
    if (response.page?.hasMore === true) {
      deps.io.stdout(`next cursor: ${oneLine(response.page.nextCursor)}\n`);
    }
  });
}

/** Headless conversation/message-request equivalent of the interactive screen. */
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
  if (subcommand === 'send') return runSend(remaining, deps);
  if (subcommand === 'read') return runRead(remaining, deps);
  if (subcommand === 'requests') return runRequests(remaining, deps);
  deps.io.stderr(`Unknown dm subcommand: ${subcommand}\n\n${USAGE}`);
  return 1;
}

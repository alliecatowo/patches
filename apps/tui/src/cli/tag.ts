import { randomUUID } from 'node:crypto';

import { credentials, Metadata, type ServiceError } from '@grpc/grpc-js';
import {
  createFeedClient,
  createTagClient,
  DEADLINES_MS,
  METADATA_KEYS,
  type FeedGrpcClient,
  type ListTagFeedRequest,
  type ListTagFeedResponse,
  type MuteTagRequest,
  type MuteTagResponse,
  type SearchTagsRequest,
  type SearchTagsResponse,
  type TagGrpcClient,
  type UnmuteTagRequest,
  type UnmuteTagResponse,
} from '@patches/proto';

import { present } from '../api/present.js';
import { SessionManager } from '../auth/session.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { CLIENT_NAME, TUI_VERSION } from '../version.js';
import { createApi, openCredentialStore, reportAuthError } from './auth-shared.js';
import type { CliIo } from './io.js';

const USAGE = `Usage: patches tag <search|feed|mute|unmute> [options]

  patches tag search <prefix> [--cursor <cursor>] [--limit <n>]
  patches tag feed <tag> [--cursor <cursor>] [--limit <n>]
  patches tag mute <tag-id>
  patches tag unmute <tag-id>

Search results are alphabetical. Tag feeds are chronological and cursor-paginated;
there is intentionally no ordering option.
`;

export interface TagCommandApi {
  searchTags: (request: SearchTagsRequest) => Promise<SearchTagsResponse>;
  listTagFeed: (request: ListTagFeedRequest) => Promise<ListTagFeedResponse>;
  muteTag: (request: MuteTagRequest, accessToken: string) => Promise<MuteTagResponse>;
  unmuteTag: (request: UnmuteTagRequest, accessToken: string) => Promise<UnmuteTagResponse>;
}

export interface TagCliDeps {
  io: CliIo;
  env: NodeJS.ProcessEnv;
  target: string;
  insecure: boolean;
  /** Test/embedding seam; omitted by the executable, which builds real gRPC clients. */
  api?: TagCommandApi | undefined;
  ensureAccessToken?: (() => Promise<string>) | undefined;
}

interface CommandContext {
  api: TagCommandApi;
  ensureAccessToken: () => Promise<string>;
  close: () => void;
}

interface PageFlags {
  cursor: string;
  limit: number;
}

function parsePageFlags(rest: readonly string[]): PageFlags | { error: string } {
  const flags: PageFlags = { cursor: '', limit: 20 };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument !== '--cursor' && argument !== '--limit') {
      return { error: `Unknown tag option: ${argument}` };
    }
    const value = rest[index + 1];
    if (value === undefined) return { error: `${argument} needs a value.` };
    index += 1;
    if (argument === '--cursor') flags.cursor = value;
    else {
      const limit = Number(value);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        return { error: '--limit must be an integer from 1 to 100.' };
      }
      flags.limit = limit;
    }
  }
  return flags;
}

export async function runTag(rest: readonly string[], deps: TagCliDeps): Promise<number> {
  const [subcommand, ...options] = rest;
  if (subcommand === '-h' || subcommand === '--help') {
    deps.io.stdout(USAGE);
    return 0;
  }
  if (subcommand === undefined) {
    deps.io.stderr(`A subcommand is required.\n\n${USAGE}`);
    return 1;
  }
  if (!['search', 'feed', 'mute', 'unmute'].includes(subcommand)) {
    deps.io.stderr(`Unknown tag subcommand: ${subcommand}\n\n${USAGE}`);
    return 1;
  }

  const context = deps.api === undefined ? createContext(deps, rest) : injectedContext(deps);
  try {
    if (subcommand === 'search' || subcommand === 'feed') {
      return runRead(subcommand, options, deps, context.api);
    }
    if (subcommand === 'mute' || subcommand === 'unmute') {
      return runMute(subcommand, options, deps, context);
    }
    return 1;
  } catch (error) {
    reportAuthError(deps.io, error, deps.target);
    return 1;
  } finally {
    context.close();
  }
}

async function runRead(
  subcommand: 'search' | 'feed',
  rest: readonly string[],
  deps: TagCliDeps,
  api: TagCommandApi,
): Promise<number> {
  const [rawTerm, ...options] = rest;
  if (rawTerm === undefined || rawTerm.startsWith('-')) {
    deps.io.stderr(`tag ${subcommand} needs a ${subcommand === 'search' ? 'prefix' : 'tag'}.\n`);
    return 1;
  }
  const flags = parsePageFlags(options);
  if ('error' in flags) {
    deps.io.stderr(`${flags.error}\n`);
    return 1;
  }
  const term = rawTerm.replace(/^#/, '');
  if (subcommand === 'search') {
    const response = await api.searchTags({ query: term, ...flags });
    const sorted = [...response.tags].sort((left, right) => left.name.localeCompare(right.name));
    for (const tag of sorted) {
      deps.io.stdout(
        `${sanitizeForTerminal(tag.id)}\t#${sanitizeForTerminal(tag.displayName || tag.name)}\n`,
      );
    }
    printCursor(response.page, deps.io);
    return 0;
  }

  const response = await api.listTagFeed({ tag: term, ...flags });
  for (const post of response.posts) {
    const author = present(post.author)
      ? `@${sanitizeForTerminal(post.author.handle)}`
      : '@unknown';
    deps.io.stdout(
      `${sanitizeForTerminal(post.id)}\t${author}\t${sanitizeForTerminal(post.body)}\n`,
    );
  }
  printCursor(response.page, deps.io);
  return 0;
}

async function runMute(
  action: 'mute' | 'unmute',
  rest: readonly string[],
  deps: TagCliDeps,
  context: CommandContext,
): Promise<number> {
  const [tagId, extra] = rest;
  if (tagId === undefined || extra !== undefined) {
    deps.io.stderr(`tag ${action} needs exactly one tag id.\n`);
    return 1;
  }
  const token = await context.ensureAccessToken();
  if (action === 'mute') await context.api.muteTag({ tagId }, token);
  else await context.api.unmuteTag({ tagId }, token);
  deps.io.stdout(`${action === 'mute' ? 'Muted' : 'Unmuted'} ${sanitizeForTerminal(tagId)}.\n`);
  return 0;
}

function printCursor(
  page: { hasMore: boolean; nextCursor: string } | null | undefined,
  io: CliIo,
): void {
  if (page?.hasMore === true) {
    io.stdout(`next-cursor\t${sanitizeForTerminal(page.nextCursor)}\n`);
  }
}

function injectedContext(deps: TagCliDeps): CommandContext {
  const api = deps.api;
  if (api === undefined) throw new Error('Tag API is unavailable.');
  return {
    api,
    ensureAccessToken:
      deps.ensureAccessToken ??
      (() => Promise.reject(new Error('Not signed in. Run `patches login`.'))),
    close: () => undefined,
  };
}

function createContext(deps: TagCliDeps, rest: readonly string[]): CommandContext {
  const channelCredentials = deps.insecure ? credentials.createInsecure() : credentials.createSsl();
  const tag = createTagClient(deps.target, channelCredentials);
  const feed = createFeedClient(deps.target, channelCredentials);
  const authApi = createApi(deps.target, deps.insecure);
  let manager: SessionManager | undefined;

  async function ensureAccessToken(): Promise<string> {
    if (manager === undefined) {
      const store = await openCredentialStore(deps.io, deps.env, rest);
      manager = new SessionManager({ api: authApi, store, nodeOrigin: deps.target });
      const session = await manager.restore();
      if (session === undefined)
        throw new Error(`Not signed in on ${deps.target}. Run \`patches login\`.`);
    }
    return manager.ensureAccessToken();
  }

  return {
    api: grpcApi(tag, feed),
    ensureAccessToken,
    close: () => {
      tag.close();
      feed.close();
      authApi.close();
    },
  };
}

function grpcApi(tag: TagGrpcClient, feed: FeedGrpcClient): TagCommandApi {
  return {
    searchTags: (request) => unary(tag.searchTags.bind(tag), request),
    listTagFeed: (request) => unary(feed.listTagFeed.bind(feed), request),
    muteTag: (request, token) => unary(tag.muteTag.bind(tag), request, token),
    unmuteTag: (request, token) => unary(tag.unmuteTag.bind(tag), request, token),
  };
}

type UnaryMethod<Request, Response> = (
  request: Request,
  metadata: Metadata,
  options: { deadline: Date },
  callback: (error: ServiceError | null, response?: Response) => void,
) => unknown;

function unary<Request, Response>(
  method: UnaryMethod<Request, Response>,
  request: Request,
  accessToken?: string,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    method(
      request,
      callMetadata(accessToken),
      { deadline: new Date(Date.now() + DEADLINES_MS.unary) },
      (error, response) => {
        if (error !== null) reject(error);
        else if (response === undefined)
          reject(new Error('The server replied with nothing at all.'));
        else resolve(response);
      },
    );
  });
}

function callMetadata(accessToken?: string): Metadata {
  const metadata = new Metadata();
  metadata.set(METADATA_KEYS.requestId, randomUUID());
  metadata.set(METADATA_KEYS.client, CLIENT_NAME);
  metadata.set(METADATA_KEYS.clientVersion, TUI_VERSION);
  if (accessToken !== undefined) metadata.set(METADATA_KEYS.authorization, `Bearer ${accessToken}`);
  return metadata;
}

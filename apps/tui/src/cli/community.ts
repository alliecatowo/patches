import { randomUUID } from 'node:crypto';

import {
  COMMUNITY_ROLE,
  POST_VISIBILITY,
  QUOTE_POLICY,
  type CreatePostRequest,
  type CreatePostResponse,
  type JoinCommunityRequest,
  type JoinCommunityResponse,
  type LeaveCommunityRequest,
  type LeaveCommunityResponse,
  type ListCommunitiesRequest,
  type ListCommunitiesResponse,
} from '@patches/proto';

import { present } from '../api/present.js';
import { type PatchesApi } from '../api/client.js';
import { SessionManager } from '../auth/session.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { createApi, openCredentialStore, reportAuthError } from './auth-shared.js';
import type { CliIo } from './io.js';

const USAGE = `Usage: patches community <list|join|leave|post> [options]

  patches community list [--cursor <cursor>] [--limit <n>]
  patches community join <community-id>
  patches community leave <community-id>
  patches community post <community-id> [--body <text>]

With no --body, post reads the body from stdin. Community timelines and lists are
chronological and cursor-paginated; this command intentionally has no ordering option.
`;

export interface CommunityCommandApi {
  listCommunities: (request: ListCommunitiesRequest) => Promise<ListCommunitiesResponse>;
  joinCommunity: (
    request: JoinCommunityRequest,
    accessToken: string,
  ) => Promise<JoinCommunityResponse>;
  leaveCommunity: (
    request: LeaveCommunityRequest,
    accessToken: string,
  ) => Promise<LeaveCommunityResponse>;
  createPost: (request: CreatePostRequest, accessToken: string) => Promise<CreatePostResponse>;
}

export interface CommunityCliDeps {
  io: CliIo;
  env: NodeJS.ProcessEnv;
  target: string;
  insecure: boolean;
  /** Test/embedding seam; omitted by the executable, which builds real gRPC clients. */
  api?: CommunityCommandApi | undefined;
  ensureAccessToken?: (() => Promise<string>) | undefined;
}

interface CommandContext {
  api: CommunityCommandApi;
  ensureAccessToken: () => Promise<string>;
  close: () => void;
}

interface ListFlags {
  cursor: string;
  limit: number;
}

function parseListFlags(rest: readonly string[]): ListFlags | { error: string } {
  const flags: ListFlags = { cursor: '', limit: 20 };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === '--cursor' || argument === '--limit') {
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
      continue;
    }
    return { error: `Unknown community list option: ${argument}` };
  }
  return flags;
}

function parsePost(
  rest: readonly string[],
): { communityId: string; body?: string } | { error: string } {
  const [communityId, ...options] = rest;
  if (communityId === undefined || communityId.startsWith('-')) {
    return { error: 'community post needs a community id.' };
  }
  let body: string | undefined;
  for (let index = 0; index < options.length; index += 1) {
    const argument = options[index];
    if (argument !== '--body') return { error: `Unknown community post option: ${argument}` };
    const value = options[index + 1];
    if (value === undefined) return { error: '--body needs text.' };
    body = value;
    index += 1;
  }
  return body === undefined ? { communityId } : { communityId, body };
}

export async function runCommunity(
  rest: readonly string[],
  deps: CommunityCliDeps,
): Promise<number> {
  const [subcommand, ...options] = rest;
  if (subcommand === '-h' || subcommand === '--help') {
    deps.io.stdout(USAGE);
    return 0;
  }
  if (subcommand === undefined) {
    deps.io.stderr(`A subcommand is required.\n\n${USAGE}`);
    return 1;
  }
  if (!['list', 'join', 'leave', 'post'].includes(subcommand)) {
    deps.io.stderr(`Unknown community subcommand: ${subcommand}\n\n${USAGE}`);
    return 1;
  }

  const context = deps.api === undefined ? createContext(deps, rest) : injectedContext(deps);
  try {
    if (subcommand === 'list') return runList(options, deps, context.api);
    if (subcommand === 'join' || subcommand === 'leave') {
      return runMembership(subcommand, options, deps, context);
    }
    return runPost(options, deps, context);
  } catch (error) {
    reportAuthError(deps.io, error, deps.target);
    return 1;
  } finally {
    context.close();
  }
}

async function runList(
  rest: readonly string[],
  deps: CommunityCliDeps,
  api: CommunityCommandApi,
): Promise<number> {
  const flags = parseListFlags(rest);
  if ('error' in flags) {
    deps.io.stderr(`${flags.error}\n`);
    return 1;
  }
  const response = await api.listCommunities(flags);
  for (const community of response.communities) {
    const membership = community.viewerRole === COMMUNITY_ROLE.UNSPECIFIED ? 'read-only' : 'joined';
    deps.io.stdout(
      `${sanitizeForTerminal(community.id)}\t+${sanitizeForTerminal(community.name)}\t` +
        `${sanitizeForTerminal(community.displayName)}\t${membership}\n`,
    );
  }
  if (response.page?.hasMore === true) {
    deps.io.stdout(`next-cursor\t${sanitizeForTerminal(response.page.nextCursor)}\n`);
  }
  return 0;
}

async function runMembership(
  action: 'join' | 'leave',
  rest: readonly string[],
  deps: CommunityCliDeps,
  context: CommandContext,
): Promise<number> {
  const [communityId, extra] = rest;
  if (communityId === undefined || extra !== undefined) {
    deps.io.stderr(`community ${action} needs exactly one community id.\n`);
    return 1;
  }
  const token = await context.ensureAccessToken();
  const response =
    action === 'join'
      ? await context.api.joinCommunity({ communityId }, token)
      : await context.api.leaveCommunity({ communityId }, token);
  const label = present(response.community)
    ? `+${sanitizeForTerminal(response.community.name)}`
    : sanitizeForTerminal(communityId);
  deps.io.stdout(`${action === 'join' ? 'Joined' : 'Left'} ${label}.\n`);
  return 0;
}

async function runPost(
  rest: readonly string[],
  deps: CommunityCliDeps,
  context: CommandContext,
): Promise<number> {
  const parsed = parsePost(rest);
  if ('error' in parsed) {
    deps.io.stderr(`${parsed.error}\n`);
    return 1;
  }
  const body = (parsed.body ?? (await deps.io.readStdin())).trim();
  if (body === '') {
    deps.io.stderr('Post body cannot be empty.\n');
    return 1;
  }
  const token = await context.ensureAccessToken();
  const response = await context.api.createPost(
    {
      clientRequestId: randomUUID(),
      body,
      linkUrl: '',
      visibility: POST_VISIBILITY.PUBLIC,
      inReplyToId: '',
      mediaIds: [],
      contentWarning: '',
      quotedPostId: '',
      communityId: parsed.communityId,
      quotePolicy: QUOTE_POLICY.UNSPECIFIED,
    },
    token,
  );
  if (!present(response.post)) throw new Error('The server did not return the new post.');
  deps.io.stdout(`${sanitizeForTerminal(response.post.id)}\n`);
  return 0;
}

function injectedContext(deps: CommunityCliDeps): CommandContext {
  const api = deps.api;
  if (api === undefined) throw new Error('Community API is unavailable.');
  return {
    api,
    ensureAccessToken:
      deps.ensureAccessToken ??
      (() => Promise.reject(new Error('Not signed in. Run `patches login`.'))),
    close: () => undefined,
  };
}

function createContext(deps: CommunityCliDeps, rest: readonly string[]): CommandContext {
  const api = createApi(deps.target, deps.insecure);
  let manager: SessionManager | undefined;

  async function ensureAccessToken(): Promise<string> {
    if (manager === undefined) {
      const store = await openCredentialStore(deps.io, deps.env, rest);
      manager = new SessionManager({ api, store, nodeOrigin: deps.target });
      const session = await manager.restore();
      if (session === undefined)
        throw new Error(`Not signed in on ${deps.target}. Run \`patches login\`.`);
    }
    return manager.ensureAccessToken();
  }

  return {
    api: apiFromClient(api),
    ensureAccessToken,
    close: () => {
      api.close();
    },
  };
}

function apiFromClient(api: PatchesApi): CommunityCommandApi {
  return {
    listCommunities: (request) => api.listCommunities(request),
    joinCommunity: (request, token) => api.joinCommunity(request, token),
    leaveCommunity: (request, token) => api.leaveCommunity(request, token),
    createPost: (request, token) => api.createPost(request, token),
  };
}

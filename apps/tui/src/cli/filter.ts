import { randomUUID } from 'node:crypto';

import { credentials, Metadata, type ServiceError } from '@grpc/grpc-js';
import {
  createFilterClient,
  DEADLINES_MS,
  FILTER_ACTION,
  FILTER_SCOPE,
  FILTER_TERM_KIND,
  METADATA_KEYS,
  type CreateFilterResponse,
  type DeleteFilterResponse,
  type ExportFiltersResponse,
  type Filter,
  type FilterAction,
  type FilterGrpcClient,
  type FilterScope,
  type FilterTermInput,
  type FilterTermKind,
  type ImportFiltersResponse,
  type ListFiltersResponse,
} from '@patches/proto';

import { sanitizeForTerminal } from '../format/sanitize.js';
import { SessionManager } from '../auth/session.js';
import { CLIENT_NAME, TUI_VERSION } from '../version.js';
import { createApi, openCredentialStore, reportAuthError } from './auth-shared.js';
import type { CliIo } from './io.js';

const USAGE = `Usage: patches filter <list|create|delete|export|import> [options]

  patches filter list [--cursor <cursor>] [--limit <n>]
  patches filter create --name <name> --action <hide|collapse|warn>
      --term <kind>:<value> [--term <kind>:<value> ...]
      [--scope <scope> ...] (defaults to every scope when omitted)
  patches filter delete <filter-id>
  patches filter export
  patches filter import [--apply]   (reads JSON from stdin; dry-run without --apply)

Term kinds: substring, word, tag, actor, domain.
Scopes: home, local, tag-feed, community-feed, notifications, search, message-requests.
Filters are always literal text — no regular expressions (spec §198.2).
`;

const KIND_ALIASES: Readonly<Record<string, FilterTermKind>> = {
  substring: FILTER_TERM_KIND.SUBSTRING,
  word: FILTER_TERM_KIND.WORD,
  tag: FILTER_TERM_KIND.TAG,
  actor: FILTER_TERM_KIND.ACTOR,
  domain: FILTER_TERM_KIND.DOMAIN,
};

const SCOPE_ALIASES: Readonly<Record<string, FilterScope>> = {
  home: FILTER_SCOPE.HOME,
  local: FILTER_SCOPE.LOCAL,
  'tag-feed': FILTER_SCOPE.TAG_FEED,
  'community-feed': FILTER_SCOPE.COMMUNITY_FEED,
  notifications: FILTER_SCOPE.NOTIFICATIONS,
  search: FILTER_SCOPE.SEARCH,
  'message-requests': FILTER_SCOPE.MESSAGE_REQUESTS,
};

const ACTION_ALIASES: Readonly<Record<string, FilterAction>> = {
  hide: FILTER_ACTION.HIDE,
  collapse: FILTER_ACTION.COLLAPSE,
  warn: FILTER_ACTION.WARN,
};

const ALL_SCOPES: readonly FilterScope[] = Object.values(SCOPE_ALIASES);

export interface FilterCommandApi {
  listFilters: (cursor: string, limit: number, accessToken: string) => Promise<ListFiltersResponse>;
  createFilter: (
    request: {
      name: string;
      terms: FilterTermInput[];
      scopes: FilterScope[];
      action: FilterAction;
    },
    accessToken: string,
  ) => Promise<CreateFilterResponse>;
  deleteFilter: (id: string, accessToken: string) => Promise<DeleteFilterResponse>;
  exportFilters: (accessToken: string) => Promise<ExportFiltersResponse>;
  importFilters: (
    json: string,
    apply: boolean,
    accessToken: string,
  ) => Promise<ImportFiltersResponse>;
}

export interface FilterCliDeps {
  io: CliIo;
  env: NodeJS.ProcessEnv;
  target: string;
  insecure: boolean;
  /** Test/embedding seam; omitted by the executable, which builds real gRPC clients. */
  api?: FilterCommandApi | undefined;
  ensureAccessToken?: (() => Promise<string>) | undefined;
}

interface CommandContext {
  api: FilterCommandApi;
  ensureAccessToken: () => Promise<string>;
  close: () => void;
}

const SUBCOMMANDS = ['list', 'create', 'delete', 'export', 'import'] as const;

function describeFilter(filter: Filter): string {
  const terms = filter.terms
    .map((term) => `${term.kind}=${sanitizeForTerminal(term.value)}`)
    .join(',');
  const scopes = filter.scopes.join(',');
  return `${sanitizeForTerminal(filter.id)}\t${sanitizeForTerminal(filter.name)}\t${filter.action}\t${scopes}\t${terms}\n`;
}

export async function runFilter(rest: readonly string[], deps: FilterCliDeps): Promise<number> {
  const [subcommand, ...options] = rest;
  if (subcommand === '-h' || subcommand === '--help') {
    deps.io.stdout(USAGE);
    return 0;
  }
  if (subcommand === undefined) {
    deps.io.stderr(`A subcommand is required.\n\n${USAGE}`);
    return 1;
  }
  if (!(SUBCOMMANDS as readonly string[]).includes(subcommand)) {
    deps.io.stderr(`Unknown filter subcommand: ${subcommand}\n\n${USAGE}`);
    return 1;
  }

  const context = deps.api === undefined ? createContext(deps, rest) : injectedContext(deps);
  try {
    if (subcommand === 'list') return runList(options, deps, context);
    if (subcommand === 'create') return runCreate(options, deps, context);
    if (subcommand === 'delete') return runDelete(options, deps, context);
    if (subcommand === 'export') return runExport(deps, context);
    return runImport(options, deps, context);
  } catch (error) {
    reportAuthError(deps.io, error, deps.target);
    return 1;
  } finally {
    context.close();
  }
}

async function runList(
  rest: readonly string[],
  deps: FilterCliDeps,
  context: CommandContext,
): Promise<number> {
  let cursor = '';
  let limit = 20;
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    const value = rest[index + 1];
    if (argument === '--cursor' && value !== undefined) {
      cursor = value;
      index += 1;
    } else if (argument === '--limit' && value !== undefined) {
      limit = Number(value);
      index += 1;
    } else {
      deps.io.stderr(`Unknown filter list option: ${String(argument)}\n`);
      return 1;
    }
  }
  const accessToken = await context.ensureAccessToken();
  const response = await context.api.listFilters(cursor, limit, accessToken);
  for (const filter of response.filters) deps.io.stdout(describeFilter(filter));
  if (response.page?.hasMore === true) {
    deps.io.stdout(`next-cursor\t${sanitizeForTerminal(response.page.nextCursor)}\n`);
  }
  return 0;
}

async function runCreate(
  rest: readonly string[],
  deps: FilterCliDeps,
  context: CommandContext,
): Promise<number> {
  let name: string | undefined;
  let action: FilterAction | undefined;
  const terms: FilterTermInput[] = [];
  const scopes: FilterScope[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    const value = rest[index + 1];
    if (argument === '--name' && value !== undefined) {
      name = value;
      index += 1;
    } else if (argument === '--action' && value !== undefined) {
      const resolved = ACTION_ALIASES[value];
      if (resolved === undefined) {
        deps.io.stderr(`Unknown filter action: ${value}\n`);
        return 1;
      }
      action = resolved;
      index += 1;
    } else if (argument === '--term' && value !== undefined) {
      const [kindText, ...valueParts] = value.split(':');
      const kind = kindText === undefined ? undefined : KIND_ALIASES[kindText];
      if (kind === undefined || valueParts.length === 0) {
        deps.io.stderr(`--term expects <kind>:<value>, got: ${value}\n`);
        return 1;
      }
      terms.push({ kind, value: valueParts.join(':') });
      index += 1;
    } else if (argument === '--scope' && value !== undefined) {
      const resolved = SCOPE_ALIASES[value];
      if (resolved === undefined) {
        deps.io.stderr(`Unknown filter scope: ${value}\n`);
        return 1;
      }
      scopes.push(resolved);
      index += 1;
    } else {
      deps.io.stderr(`Unknown filter create option: ${String(argument)}\n`);
      return 1;
    }
  }

  if (name === undefined || name.trim() === '') {
    deps.io.stderr('filter create needs --name.\n');
    return 1;
  }
  if (action === undefined) {
    deps.io.stderr('filter create needs --action <hide|collapse|warn>.\n');
    return 1;
  }
  if (terms.length === 0) {
    deps.io.stderr('filter create needs at least one --term <kind>:<value>.\n');
    return 1;
  }

  const accessToken = await context.ensureAccessToken();
  const response = await context.api.createFilter(
    { name: name.trim(), terms, scopes: scopes.length === 0 ? [...ALL_SCOPES] : scopes, action },
    accessToken,
  );
  if (response.filter === undefined) {
    deps.io.stderr('The server did not return the new filter.\n');
    return 1;
  }
  deps.io.stdout(describeFilter(response.filter));
  return 0;
}

async function runDelete(
  rest: readonly string[],
  deps: FilterCliDeps,
  context: CommandContext,
): Promise<number> {
  const [id, extra] = rest;
  if (id === undefined || extra !== undefined) {
    deps.io.stderr('filter delete needs exactly one filter id.\n');
    return 1;
  }
  const accessToken = await context.ensureAccessToken();
  await context.api.deleteFilter(id, accessToken);
  deps.io.stdout(`Deleted ${sanitizeForTerminal(id)}.\n`);
  return 0;
}

async function runExport(deps: FilterCliDeps, context: CommandContext): Promise<number> {
  const accessToken = await context.ensureAccessToken();
  const response = await context.api.exportFilters(accessToken);
  deps.io.stdout(`${response.json}\n`);
  return 0;
}

async function runImport(
  rest: readonly string[],
  deps: FilterCliDeps,
  context: CommandContext,
): Promise<number> {
  const apply = rest.includes('--apply');
  const json = (await deps.io.readStdin()).trim();
  if (json === '') {
    deps.io.stderr('filter import reads JSON from stdin (see filter export).\n');
    return 1;
  }
  const accessToken = await context.ensureAccessToken();
  const response = await context.api.importFilters(json, apply, accessToken);
  for (const filter of response.added) deps.io.stdout(describeFilter(filter));
  deps.io.stdout(
    apply
      ? `Imported ${String(response.added.length)} filter(s).\n`
      : `Would import ${String(response.added.length)} filter(s) — pass --apply to commit.\n`,
  );
  return 0;
}

function injectedContext(deps: FilterCliDeps): CommandContext {
  const api = deps.api;
  if (api === undefined) throw new Error('Filter API is unavailable.');
  return {
    api,
    ensureAccessToken:
      deps.ensureAccessToken ??
      (() => Promise.reject(new Error('Not signed in. Run `patches login`.'))),
    close: () => undefined,
  };
}

function createContext(deps: FilterCliDeps, rest: readonly string[]): CommandContext {
  const channelCredentials = deps.insecure ? credentials.createInsecure() : credentials.createSsl();
  const filter = createFilterClient(deps.target, channelCredentials);
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
    api: grpcApi(filter),
    ensureAccessToken,
    close: () => {
      filter.close();
      authApi.close();
    },
  };
}

function grpcApi(filter: FilterGrpcClient): FilterCommandApi {
  return {
    listFilters: (cursor, limit, token) =>
      unary(filter.listFilters.bind(filter), { cursor, limit }, token),
    createFilter: (request, token) =>
      unary(filter.createFilter.bind(filter), { ...request, expiresAt: undefined }, token),
    deleteFilter: (id, token) => unary(filter.deleteFilter.bind(filter), { id }, token),
    exportFilters: (token) => unary(filter.exportFilters.bind(filter), {}, token),
    importFilters: (json, apply, token) =>
      unary(filter.importFilters.bind(filter), { json, apply }, token),
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

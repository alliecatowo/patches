import { FILTER_ACTION, FILTER_TERM_KIND } from '@patches/proto';
import type {
  FilterAction,
  FilterList,
  FilterListEntry,
  FilterListSubscription,
  FilterTermInput,
  FilterTermKind,
  ListFilterListEntriesResponse,
  ListFilterListsResponse,
  ListFilterListSubscriptionsResponse,
  PublishFilterListResponse,
  SetFilterListEntryExceptionResponse,
  SubscribeFilterListResponse,
  UnsubscribeFilterListResponse,
} from '../api/wire/types.js';

import { present } from '../api/present.js';
import { type PatchesApi } from '../api/client.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { SessionManager } from '../auth/session.js';
import { createApi, openCredentialStore, reportAuthError } from './auth-shared.js';
import type { CliIo } from './io.js';

const USAGE = `Usage: patches lists <browse|mine|entries|publish|subscribe|unsubscribe|exception> [options]

  patches lists browse [--owner <actor-id>] [--cursor <cursor>] [--limit <n>]
  patches lists mine [--cursor <cursor>] [--limit <n>]
  patches lists entries <list-id> [--cursor <cursor>] [--limit <n>]
  patches lists publish --name <name> --display-name <name> [--description <text>]
      --term <kind>:<value> [--term <kind>:<value> ...]
  patches lists subscribe <list-id> [--action hide|collapse|warn]  (default: collapse)
  patches lists unsubscribe <list-id>
  patches lists exception <list-id> <entry-id> <on|off>

A subscription never creates a block, and unsubscribing is instant (spec §199.2/§199.3).
`;

const KIND_ALIASES: Readonly<Record<string, FilterTermKind>> = {
  substring: FILTER_TERM_KIND.SUBSTRING,
  word: FILTER_TERM_KIND.WORD,
  tag: FILTER_TERM_KIND.TAG,
  actor: FILTER_TERM_KIND.ACTOR,
  domain: FILTER_TERM_KIND.DOMAIN,
};

const ACTION_ALIASES: Readonly<Record<string, FilterAction>> = {
  hide: FILTER_ACTION.HIDE,
  collapse: FILTER_ACTION.COLLAPSE,
  warn: FILTER_ACTION.WARN,
};

export interface FilterListCommandApi {
  listFilterLists: (
    ownerActorId: string,
    cursor: string,
    limit: number,
  ) => Promise<ListFilterListsResponse>;
  listFilterListSubscriptions: (
    cursor: string,
    limit: number,
    accessToken: string,
  ) => Promise<ListFilterListSubscriptionsResponse>;
  listFilterListEntries: (
    filterListId: string,
    cursor: string,
    limit: number,
  ) => Promise<ListFilterListEntriesResponse>;
  publishFilterList: (
    request: {
      name: string;
      displayName: string;
      description: string;
      ownerCommunityId: string;
      entries: FilterTermInput[];
    },
    accessToken: string,
  ) => Promise<PublishFilterListResponse>;
  subscribeFilterList: (
    filterListId: string,
    action: FilterAction,
    accessToken: string,
  ) => Promise<SubscribeFilterListResponse>;
  unsubscribeFilterList: (
    filterListId: string,
    accessToken: string,
  ) => Promise<UnsubscribeFilterListResponse>;
  setFilterListEntryException: (
    filterListId: string,
    entryId: string,
    excepted: boolean,
    accessToken: string,
  ) => Promise<SetFilterListEntryExceptionResponse>;
}

export interface FilterListCliDeps {
  io: CliIo;
  env: NodeJS.ProcessEnv;
  target: string;
  insecure: boolean;
  /** Test/embedding seam; omitted by the executable, which builds real gRPC clients. */
  api?: FilterListCommandApi | undefined;
  ensureAccessToken?: (() => Promise<string>) | undefined;
}

interface CommandContext {
  api: FilterListCommandApi;
  ensureAccessToken: () => Promise<string>;
  close: () => void;
}

const SUBCOMMANDS = [
  'browse',
  'mine',
  'entries',
  'publish',
  'subscribe',
  'unsubscribe',
  'exception',
] as const;

function describeList(list: FilterList): string {
  const owner = present(list.ownerActor)
    ? `@${sanitizeForTerminal(list.ownerActor.handle)}`
    : present(list.ownerCommunity)
      ? `+${sanitizeForTerminal(list.ownerCommunity.name)}`
      : 'unknown';
  return `${sanitizeForTerminal(list.id)}\t${sanitizeForTerminal(list.displayName || list.name)}\t${owner}\n`;
}

function describeSubscription(subscription: FilterListSubscription): string {
  const list = subscription.filterList;
  const name = present(list) ? sanitizeForTerminal(list.displayName || list.name) : 'unknown';
  const id = present(list) ? sanitizeForTerminal(list.id) : '';
  return `${id}\t${name}\t${subscription.action}\n`;
}

function describeEntry(entry: FilterListEntry): string {
  return `${sanitizeForTerminal(entry.id)}\t${entry.kind}\t${sanitizeForTerminal(entry.value)}\n`;
}

export async function runLists(rest: readonly string[], deps: FilterListCliDeps): Promise<number> {
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
    deps.io.stderr(`Unknown lists subcommand: ${subcommand}\n\n${USAGE}`);
    return 1;
  }

  const context = deps.api === undefined ? createContext(deps, rest) : injectedContext(deps);
  try {
    if (subcommand === 'browse') return runBrowse(options, deps, context);
    if (subcommand === 'mine') return runMine(options, deps, context);
    if (subcommand === 'entries') return runEntries(options, deps, context);
    if (subcommand === 'publish') return runPublish(options, deps, context);
    if (subcommand === 'subscribe') return runSubscribe(options, deps, context);
    if (subcommand === 'unsubscribe') return runUnsubscribe(options, deps, context);
    return runException(options, deps, context);
  } catch (error) {
    reportAuthError(deps.io, error, deps.target);
    return 1;
  } finally {
    context.close();
  }
}

function parsePageFlags(
  rest: readonly string[],
): { owner: string; cursor: string; limit: number } | { error: string } {
  const flags = { owner: '', cursor: '', limit: 20 };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    const value = rest[index + 1];
    if (argument === '--owner' && value !== undefined) {
      flags.owner = value;
      index += 1;
    } else if (argument === '--cursor' && value !== undefined) {
      flags.cursor = value;
      index += 1;
    } else if (argument === '--limit' && value !== undefined) {
      flags.limit = Number(value);
      index += 1;
    } else {
      return { error: `Unknown option: ${String(argument)}` };
    }
  }
  return flags;
}

async function runBrowse(
  rest: readonly string[],
  deps: FilterListCliDeps,
  context: CommandContext,
): Promise<number> {
  const flags = parsePageFlags(rest);
  if ('error' in flags) {
    deps.io.stderr(`${flags.error}\n`);
    return 1;
  }
  const response = await context.api.listFilterLists(flags.owner, flags.cursor, flags.limit);
  for (const list of response.filterLists) deps.io.stdout(describeList(list));
  printCursor(response.page, deps.io);
  return 0;
}

async function runMine(
  rest: readonly string[],
  deps: FilterListCliDeps,
  context: CommandContext,
): Promise<number> {
  const flags = parsePageFlags(rest);
  if ('error' in flags) {
    deps.io.stderr(`${flags.error}\n`);
    return 1;
  }
  const accessToken = await context.ensureAccessToken();
  const response = await context.api.listFilterListSubscriptions(
    flags.cursor,
    flags.limit,
    accessToken,
  );
  for (const subscription of response.subscriptions)
    deps.io.stdout(describeSubscription(subscription));
  printCursor(response.page, deps.io);
  return 0;
}

async function runEntries(
  rest: readonly string[],
  deps: FilterListCliDeps,
  context: CommandContext,
): Promise<number> {
  const [id, ...rawOptions] = rest;
  if (id === undefined) {
    deps.io.stderr('lists entries needs a filter-list id.\n');
    return 1;
  }
  const flags = parsePageFlags(rawOptions);
  if ('error' in flags) {
    deps.io.stderr(`${flags.error}\n`);
    return 1;
  }
  const response = await context.api.listFilterListEntries(id, flags.cursor, flags.limit);
  for (const entry of response.entries) deps.io.stdout(describeEntry(entry));
  printCursor(response.page, deps.io);
  return 0;
}

async function runPublish(
  rest: readonly string[],
  deps: FilterListCliDeps,
  context: CommandContext,
): Promise<number> {
  let name: string | undefined;
  let displayName = '';
  let description = '';
  let ownerCommunityId = '';
  const entries: FilterTermInput[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    const value = rest[index + 1];
    if (argument === '--name' && value !== undefined) {
      name = value;
      index += 1;
    } else if (argument === '--display-name' && value !== undefined) {
      displayName = value;
      index += 1;
    } else if (argument === '--description' && value !== undefined) {
      description = value;
      index += 1;
    } else if (argument === '--community' && value !== undefined) {
      ownerCommunityId = value;
      index += 1;
    } else if (argument === '--term' && value !== undefined) {
      const [kindText, ...valueParts] = value.split(':');
      const kind = kindText === undefined ? undefined : KIND_ALIASES[kindText];
      if (kind === undefined || valueParts.length === 0) {
        deps.io.stderr(`--term expects <kind>:<value>, got: ${value}\n`);
        return 1;
      }
      entries.push({ kind, value: valueParts.join(':') });
      index += 1;
    } else {
      deps.io.stderr(`Unknown lists publish option: ${String(argument)}\n`);
      return 1;
    }
  }

  if (name === undefined || name.trim() === '') {
    deps.io.stderr('lists publish needs --name.\n');
    return 1;
  }

  const accessToken = await context.ensureAccessToken();
  const response = await context.api.publishFilterList(
    { name: name.trim(), displayName, description, ownerCommunityId, entries },
    accessToken,
  );
  if (response.filterList === undefined) {
    deps.io.stderr('The server did not return the new filter list.\n');
    return 1;
  }
  deps.io.stdout(describeList(response.filterList));
  return 0;
}

async function runSubscribe(
  rest: readonly string[],
  deps: FilterListCliDeps,
  context: CommandContext,
): Promise<number> {
  const [id, ...options] = rest;
  if (id === undefined) {
    deps.io.stderr('lists subscribe needs a filter-list id.\n');
    return 1;
  }
  let action: FilterAction = FILTER_ACTION.COLLAPSE;
  for (let index = 0; index < options.length; index += 1) {
    if (options[index] === '--action' && options[index + 1] !== undefined) {
      const resolved = ACTION_ALIASES[options[index + 1] as string];
      if (resolved === undefined) {
        deps.io.stderr(`Unknown filter action: ${String(options[index + 1])}\n`);
        return 1;
      }
      action = resolved;
      index += 1;
    }
  }
  const accessToken = await context.ensureAccessToken();
  await context.api.subscribeFilterList(id, action, accessToken);
  deps.io.stdout(`Subscribed to ${sanitizeForTerminal(id)} (${action}).\n`);
  return 0;
}

async function runUnsubscribe(
  rest: readonly string[],
  deps: FilterListCliDeps,
  context: CommandContext,
): Promise<number> {
  const [id] = rest;
  if (id === undefined) {
    deps.io.stderr('lists unsubscribe needs a filter-list id.\n');
    return 1;
  }
  const accessToken = await context.ensureAccessToken();
  await context.api.unsubscribeFilterList(id, accessToken);
  deps.io.stdout(`Unsubscribed from ${sanitizeForTerminal(id)}.\n`);
  return 0;
}

async function runException(
  rest: readonly string[],
  deps: FilterListCliDeps,
  context: CommandContext,
): Promise<number> {
  const [listId, entryId, state] = rest;
  if (listId === undefined || entryId === undefined || (state !== 'on' && state !== 'off')) {
    deps.io.stderr('lists exception needs <list-id> <entry-id> <on|off>.\n');
    return 1;
  }
  const accessToken = await context.ensureAccessToken();
  await context.api.setFilterListEntryException(listId, entryId, state === 'on', accessToken);
  deps.io.stdout(`Exception ${state} for ${sanitizeForTerminal(entryId)}.\n`);
  return 0;
}

function printCursor(
  page: { hasMore: boolean; nextCursor: string } | null | undefined,
  io: CliIo,
): void {
  if (page?.hasMore === true) io.stdout(`next-cursor\t${sanitizeForTerminal(page.nextCursor)}\n`);
}

function injectedContext(deps: FilterListCliDeps): CommandContext {
  const api = deps.api;
  if (api === undefined) throw new Error('Filter list API is unavailable.');
  return {
    api,
    ensureAccessToken:
      deps.ensureAccessToken ??
      (() => Promise.reject(new Error('Not signed in. Run `patches login`.'))),
    close: () => undefined,
  };
}

function createContext(deps: FilterListCliDeps, rest: readonly string[]): CommandContext {
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

function apiFromClient(api: PatchesApi): FilterListCommandApi {
  return {
    listFilterLists: (ownerActorId, cursor, limit) =>
      api.listFilterLists({ ownerActorId, cursor, limit }),
    listFilterListSubscriptions: (cursor, limit, token) =>
      api.listFilterListSubscriptions({ cursor, limit }, token),
    listFilterListEntries: (filterListId, cursor, limit) =>
      api.listFilterListEntries({ filterListId, cursor, limit }),
    publishFilterList: (request, token) => api.publishFilterList(request, token),
    subscribeFilterList: (filterListId, action, token) =>
      // Empty `scopes` defaults to every scope (P14-022) — the CLI has no per-scope UI yet.
      api.subscribeFilterList({ filterListId, action, scopes: [] }, token),
    unsubscribeFilterList: (filterListId, token) =>
      api.unsubscribeFilterList({ filterListId }, token),
    setFilterListEntryException: (filterListId, filterListEntryId, excepted, token) =>
      api.setFilterListEntryException({ filterListId, filterListEntryId, excepted }, token),
  };
}

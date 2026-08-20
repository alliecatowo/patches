import { LABEL_ACTION } from '@patches/proto';
import type {
  LabelAction,
  Labeler,
  ListLabelersResponse,
  SetLabelerSubscriptionActionResponse,
  SubscribeLabelerResponse,
  UnsubscribeLabelerResponse,
} from '../api/wire/types.js';

import { present } from '../api/present.js';
import { type PatchesApi } from '../api/client.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { SessionManager } from '../auth/session.js';
import { createApi, openCredentialStore, reportAuthError } from './auth-shared.js';
import type { CliIo } from './io.js';

const USAGE = `Usage: patches labelers <list|subscribe|unsubscribe|action> [options]

  patches labelers list [--cursor <cursor>] [--limit <n>]
  patches labelers subscribe <labeler-id>
  patches labelers unsubscribe <labeler-id>
  patches labelers action <labeler-id> <value> <ignore|warn|collapse|hide>

Labels are visible only to actors subscribed to that labeler, and never affect
ordering or any score (spec §200.3). A value the node has marked mandatory
cannot be set to ignore.
`;

const ACTION_ALIASES: Readonly<Record<string, LabelAction>> = {
  ignore: LABEL_ACTION.IGNORE,
  warn: LABEL_ACTION.WARN,
  collapse: LABEL_ACTION.COLLAPSE,
  hide: LABEL_ACTION.HIDE,
};

export interface LabelerCommandApi {
  listLabelers: (cursor: string, limit: number) => Promise<ListLabelersResponse>;
  subscribeLabeler: (labelerId: string, accessToken: string) => Promise<SubscribeLabelerResponse>;
  unsubscribeLabeler: (
    labelerId: string,
    accessToken: string,
  ) => Promise<UnsubscribeLabelerResponse>;
  setLabelerSubscriptionAction: (
    labelerId: string,
    value: string,
    action: LabelAction,
    accessToken: string,
  ) => Promise<SetLabelerSubscriptionActionResponse>;
}

export interface LabelerCliDeps {
  io: CliIo;
  env: NodeJS.ProcessEnv;
  target: string;
  insecure: boolean;
  /** Test/embedding seam; omitted by the executable, which builds real gRPC clients. */
  api?: LabelerCommandApi | undefined;
  ensureAccessToken?: (() => Promise<string>) | undefined;
}

interface CommandContext {
  api: LabelerCommandApi;
  ensureAccessToken: () => Promise<string>;
  close: () => void;
}

const SUBCOMMANDS = ['list', 'subscribe', 'unsubscribe', 'action'] as const;

function describeLabeler(labeler: Labeler): string {
  const owner = labeler.isNodeLabeler
    ? 'node'
    : present(labeler.actor)
      ? `@${sanitizeForTerminal(labeler.actor.handle)}`
      : present(labeler.community)
        ? `+${sanitizeForTerminal(labeler.community.name)}`
        : 'unknown';
  const values = labeler.vocabulary.map((entry) => sanitizeForTerminal(entry.value)).join(',');
  return `${sanitizeForTerminal(labeler.id)}\t${owner}\t${values}\n`;
}

export async function runLabelers(rest: readonly string[], deps: LabelerCliDeps): Promise<number> {
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
    deps.io.stderr(`Unknown labelers subcommand: ${subcommand}\n\n${USAGE}`);
    return 1;
  }

  const context = deps.api === undefined ? createContext(deps, rest) : injectedContext(deps);
  try {
    if (subcommand === 'list') return runList(options, deps, context);
    if (subcommand === 'subscribe') return runSubscribe(options, deps, context);
    if (subcommand === 'unsubscribe') return runUnsubscribe(options, deps, context);
    return runAction(options, deps, context);
  } catch (error) {
    reportAuthError(deps.io, error, deps.target);
    return 1;
  } finally {
    context.close();
  }
}

async function runList(
  rest: readonly string[],
  deps: LabelerCliDeps,
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
      deps.io.stderr(`Unknown labelers list option: ${String(argument)}\n`);
      return 1;
    }
  }
  const response = await context.api.listLabelers(cursor, limit);
  for (const labeler of response.labelers) deps.io.stdout(describeLabeler(labeler));
  if (response.page?.hasMore === true) {
    deps.io.stdout(`next-cursor\t${sanitizeForTerminal(response.page.nextCursor)}\n`);
  }
  return 0;
}

async function runSubscribe(
  rest: readonly string[],
  deps: LabelerCliDeps,
  context: CommandContext,
): Promise<number> {
  const [id] = rest;
  if (id === undefined) {
    deps.io.stderr('labelers subscribe needs a labeler id.\n');
    return 1;
  }
  const accessToken = await context.ensureAccessToken();
  await context.api.subscribeLabeler(id, accessToken);
  deps.io.stdout(`Subscribed to ${sanitizeForTerminal(id)}.\n`);
  return 0;
}

async function runUnsubscribe(
  rest: readonly string[],
  deps: LabelerCliDeps,
  context: CommandContext,
): Promise<number> {
  const [id] = rest;
  if (id === undefined) {
    deps.io.stderr('labelers unsubscribe needs a labeler id.\n');
    return 1;
  }
  const accessToken = await context.ensureAccessToken();
  await context.api.unsubscribeLabeler(id, accessToken);
  deps.io.stdout(`Unsubscribed from ${sanitizeForTerminal(id)}.\n`);
  return 0;
}

async function runAction(
  rest: readonly string[],
  deps: LabelerCliDeps,
  context: CommandContext,
): Promise<number> {
  const [id, value, actionText] = rest;
  if (id === undefined || value === undefined || actionText === undefined) {
    deps.io.stderr('labelers action needs <labeler-id> <value> <ignore|warn|collapse|hide>.\n');
    return 1;
  }
  const action = ACTION_ALIASES[actionText];
  if (action === undefined) {
    deps.io.stderr(`Unknown label action: ${actionText}\n`);
    return 1;
  }
  const accessToken = await context.ensureAccessToken();
  await context.api.setLabelerSubscriptionAction(id, value, action, accessToken);
  deps.io.stdout(`${sanitizeForTerminal(value)} -> ${action}\n`);
  return 0;
}

function injectedContext(deps: LabelerCliDeps): CommandContext {
  const api = deps.api;
  if (api === undefined) throw new Error('Labeler API is unavailable.');
  return {
    api,
    ensureAccessToken:
      deps.ensureAccessToken ??
      (() => Promise.reject(new Error('Not signed in. Run `patches login`.'))),
    close: () => undefined,
  };
}

function createContext(deps: LabelerCliDeps, rest: readonly string[]): CommandContext {
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

function apiFromClient(api: PatchesApi): LabelerCommandApi {
  return {
    listLabelers: (cursor, limit) => api.listLabelers({ cursor, limit }),
    subscribeLabeler: (labelerId, token) => api.subscribeLabeler({ labelerId }, token),
    unsubscribeLabeler: (labelerId, token) => api.unsubscribeLabeler({ labelerId }, token),
    setLabelerSubscriptionAction: (labelerId, value, action, token) =>
      api.setLabelerSubscriptionAction({ labelerId, value, action }, token),
  };
}

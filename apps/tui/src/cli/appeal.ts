import type {
  Appeal,
  CreateAppealResponse,
  GetAppealResponse,
  ListMyAppealsResponse,
} from '../api/wire/types.js';
import { APPEAL_STATUS_SCHEMA, enumWireName } from '../api/wire/enums.js';

import { sanitizeForTerminal } from '../format/sanitize.js';
import { SessionManager } from '../auth/session.js';
import { type PatchesApi } from '../api/client.js';
import { createApi, openCredentialStore, reportAuthError } from './auth-shared.js';
import type { CliIo } from './io.js';

const USAGE = `Usage: patches appeal <list|create|show> [options]

  patches appeal list [--cursor <cursor>] [--limit <n>]
  patches appeal create <moderation-notice-id> [--statement <text>]
  patches appeal show <appeal-id>

With no --statement, create reads the statement from stdin. Only the acted-upon
actor may appeal a moderation notice, and only one appeal per notice (spec §201.3).
`;

export interface AppealCommandApi {
  listMyAppeals: (
    cursor: string,
    limit: number,
    accessToken: string,
  ) => Promise<ListMyAppealsResponse>;
  createAppeal: (
    moderationNoticeId: string,
    statement: string,
    accessToken: string,
  ) => Promise<CreateAppealResponse>;
  getAppeal: (id: string, accessToken: string) => Promise<GetAppealResponse>;
}

export interface AppealCliDeps {
  io: CliIo;
  env: NodeJS.ProcessEnv;
  target: string;
  insecure: boolean;
  /** Test/embedding seam; omitted by the executable, which builds real gRPC clients. */
  api?: AppealCommandApi | undefined;
  ensureAccessToken?: (() => Promise<string>) | undefined;
}

interface CommandContext {
  api: AppealCommandApi;
  ensureAccessToken: () => Promise<string>;
  close: () => void;
}

const SUBCOMMANDS = ['list', 'create', 'show'] as const;

function describeAppeal(appeal: Appeal): string {
  return `${sanitizeForTerminal(appeal.id)}\t${enumWireName(APPEAL_STATUS_SCHEMA, appeal.status)}\t${sanitizeForTerminal(appeal.moderationNoticeId)}\n`;
}

export async function runAppeal(rest: readonly string[], deps: AppealCliDeps): Promise<number> {
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
    deps.io.stderr(`Unknown appeal subcommand: ${subcommand}\n\n${USAGE}`);
    return 1;
  }

  const context = deps.api === undefined ? createContext(deps, rest) : injectedContext(deps);
  try {
    if (subcommand === 'list') return runList(options, deps, context);
    if (subcommand === 'create') return runCreate(options, deps, context);
    return runShow(options, deps, context);
  } catch (error) {
    reportAuthError(deps.io, error, deps.target);
    return 1;
  } finally {
    context.close();
  }
}

async function runList(
  rest: readonly string[],
  deps: AppealCliDeps,
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
      deps.io.stderr(`Unknown appeal list option: ${String(argument)}\n`);
      return 1;
    }
  }
  const accessToken = await context.ensureAccessToken();
  const response = await context.api.listMyAppeals(cursor, limit, accessToken);
  for (const appeal of response.appeals) deps.io.stdout(describeAppeal(appeal));
  if (response.page?.hasMore === true) {
    deps.io.stdout(`next-cursor\t${sanitizeForTerminal(response.page.nextCursor)}\n`);
  }
  return 0;
}

async function runCreate(
  rest: readonly string[],
  deps: AppealCliDeps,
  context: CommandContext,
): Promise<number> {
  const [noticeId, ...options] = rest;
  if (noticeId === undefined) {
    deps.io.stderr('appeal create needs a moderation-notice id.\n');
    return 1;
  }
  let statement: string | undefined;
  for (let index = 0; index < options.length; index += 1) {
    if (options[index] === '--statement' && options[index + 1] !== undefined) {
      statement = options[index + 1];
      index += 1;
    }
  }
  const finalStatement = (statement ?? (await deps.io.readStdin())).trim();
  if (finalStatement === '') {
    deps.io.stderr('An appeal statement is required.\n');
    return 1;
  }
  const accessToken = await context.ensureAccessToken();
  const response = await context.api.createAppeal(noticeId, finalStatement, accessToken);
  if (response.appeal === undefined) {
    deps.io.stderr('The server did not return the new appeal.\n');
    return 1;
  }
  deps.io.stdout(describeAppeal(response.appeal));
  return 0;
}

async function runShow(
  rest: readonly string[],
  deps: AppealCliDeps,
  context: CommandContext,
): Promise<number> {
  const [id] = rest;
  if (id === undefined) {
    deps.io.stderr('appeal show needs an appeal id.\n');
    return 1;
  }
  const accessToken = await context.ensureAccessToken();
  const response = await context.api.getAppeal(id, accessToken);
  if (response.appeal === undefined) {
    deps.io.stderr('Appeal not found.\n');
    return 1;
  }
  const appeal = response.appeal;
  deps.io.stdout(describeAppeal(appeal));
  deps.io.stdout(`statement\t${sanitizeForTerminal(appeal.statement)}\n`);
  if (appeal.resolutionReason !== '') {
    deps.io.stdout(`resolution\t${sanitizeForTerminal(appeal.resolutionReason)}\n`);
  }
  return 0;
}

function injectedContext(deps: AppealCliDeps): CommandContext {
  const api = deps.api;
  if (api === undefined) throw new Error('Appeal API is unavailable.');
  return {
    api,
    ensureAccessToken:
      deps.ensureAccessToken ??
      (() => Promise.reject(new Error('Not signed in. Run `patches login`.'))),
    close: () => undefined,
  };
}

function createContext(deps: AppealCliDeps, rest: readonly string[]): CommandContext {
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

function apiFromClient(api: PatchesApi): AppealCommandApi {
  return {
    listMyAppeals: (cursor, limit, token) => api.listMyAppeals({ cursor, limit }, token),
    createAppeal: (moderationNoticeId, statement, token) =>
      api.createAppeal({ moderationNoticeId, statement }, token),
    getAppeal: (id, token) => api.getAppeal({ id }, token),
  };
}

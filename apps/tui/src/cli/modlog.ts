import { MODERATION_LOG_SUBJECT_KIND } from '../api/wire/enums.js';
import type { ListModerationLogResponse, ModerationLogEntry } from '../api/wire/types.js';

import { sanitizeForTerminal } from '../format/sanitize.js';
import { type PatchesApi } from '../api/client.js';
import { createApi } from './auth-shared.js';
import type { CliIo } from './io.js';

const USAGE = `Usage: patches modlog [--cursor <cursor>] [--limit <n>]

This node's public, anonymized moderation log (spec §201.4) — unauthenticated.
Account/post/media entries never carry a handle, actor id, or post id; domain
entries are fully identified because they are this node's own federation
decision, not a record of any individual's conduct.
`;

export interface ModerationLogCommandApi {
  listModerationLog: (cursor: string, limit: number) => Promise<ListModerationLogResponse>;
}

export interface ModerationLogCliDeps {
  io: CliIo;
  target: string;
  insecure: boolean;
  /** Test/embedding seam; omitted by the executable, which builds a real gRPC client. */
  api?: ModerationLogCommandApi | undefined;
}

function describeEntry(entry: ModerationLogEntry): string {
  const subject =
    entry.subjectKind === MODERATION_LOG_SUBJECT_KIND.DOMAIN
      ? sanitizeForTerminal(entry.subjectDomain)
      : entry.subjectKind.replace('MODERATION_LOG_SUBJECT_KIND_', '').toLowerCase();
  return `${sanitizeForTerminal(entry.id)}\t${entry.action}\t${subject}\t${entry.reasonCategory}\t${String(entry.appealed)}\n`;
}

export async function runModlog(
  rest: readonly string[],
  deps: ModerationLogCliDeps,
): Promise<number> {
  if (rest.includes('-h') || rest.includes('--help')) {
    deps.io.stdout(USAGE);
    return 0;
  }
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
      deps.io.stderr(`Unknown modlog option: ${String(argument)}\n\n${USAGE}`);
      return 1;
    }
  }

  const context =
    deps.api === undefined ? createContext(deps) : { api: deps.api, close: () => undefined };
  try {
    const response = await context.api.listModerationLog(cursor, limit);
    for (const entry of response.entries) deps.io.stdout(describeEntry(entry));
    if (response.page?.hasMore === true) {
      deps.io.stdout(`next-cursor\t${sanitizeForTerminal(response.page.nextCursor)}\n`);
    }
    return 0;
  } catch (error) {
    deps.io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  } finally {
    context.close();
  }
}

function createContext(deps: ModerationLogCliDeps): {
  api: ModerationLogCommandApi;
  close: () => void;
} {
  const api = createApi(deps.target, deps.insecure);
  return {
    api: apiFromClient(api),
    close: () => {
      api.close();
    },
  };
}

function apiFromClient(api: PatchesApi): ModerationLogCommandApi {
  return {
    listModerationLog: (cursor, limit) => api.listModerationLog({ cursor, limit }),
  };
}

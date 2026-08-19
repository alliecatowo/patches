import { randomUUID } from 'node:crypto';

import { credentials, Metadata, type ServiceError } from '@grpc/grpc-js';
import {
  createModerationClient,
  DEADLINES_MS,
  METADATA_KEYS,
  MODERATION_LOG_SUBJECT_KIND,
  type ListModerationLogResponse,
  type ModerationLogEntry,
} from '@patches/proto';

import { sanitizeForTerminal } from '../format/sanitize.js';
import { CLIENT_NAME, TUI_VERSION } from '../version.js';
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
  env: NodeJS.ProcessEnv;
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

  const api = deps.api ?? createGrpcApi(deps);
  try {
    const response = await api.listModerationLog(cursor, limit);
    for (const entry of response.entries) deps.io.stdout(describeEntry(entry));
    if (response.page?.hasMore === true) {
      deps.io.stdout(`next-cursor\t${sanitizeForTerminal(response.page.nextCursor)}\n`);
    }
    return 0;
  } catch (error) {
    deps.io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

function createGrpcApi(deps: ModerationLogCliDeps): ModerationLogCommandApi {
  const channelCredentials = deps.insecure ? credentials.createInsecure() : credentials.createSsl();
  const moderation = createModerationClient(deps.target, channelCredentials);
  return {
    listModerationLog: (cursor, limit) =>
      unary(moderation.listModerationLog.bind(moderation), { cursor, limit }),
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
): Promise<Response> {
  return new Promise((resolve, reject) => {
    method(
      request,
      callMetadata(),
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

function callMetadata(): Metadata {
  const metadata = new Metadata();
  metadata.set(METADATA_KEYS.requestId, randomUUID());
  metadata.set(METADATA_KEYS.client, CLIENT_NAME);
  metadata.set(METADATA_KEYS.clientVersion, TUI_VERSION);
  return metadata;
}

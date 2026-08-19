import { randomUUID } from 'node:crypto';

import { credentials, Metadata, type ServiceError } from '@grpc/grpc-js';
import {
  createNodeClient,
  createPrivacyClient,
  DEADLINES_MS,
  METADATA_KEYS,
  type AcknowledgePrivacyNoticeRequest,
  type AcknowledgePrivacyNoticeResponse,
  type CancelAccountDeletionResponse,
  type ExportAccountResponse,
  type GetDeletionStatusResponse,
  type GetExportStatusResponse,
  type GetNodePolicyResponse,
  type GetPrivacyPrefsResponse,
  type NodeGrpcClient,
  type PrivacyGrpcClient,
  type RequestAccountDeletionResponse,
  type UpdatePrivacyPrefsRequest,
  type UpdatePrivacyPrefsResponse,
} from '@patches/proto';

import { present } from '../api/present.js';
import { SessionManager } from '../auth/session.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { CLIENT_NAME, TUI_VERSION } from '../version.js';
import { createApi, openCredentialStore, reportAuthError } from './auth-shared.js';
import type { CliIo } from './io.js';

const USAGE = `Usage: patches privacy <show|set|ack|export|delete|cancel-delete> [options]

  patches privacy show
  patches privacy set <discoverable|indexable|show-in-local-feed|locked> <on|off>
  patches privacy ack
  patches privacy export
  patches privacy delete [--yes]
  patches privacy cancel-delete

"delete" requests account deletion after this node's grace period (spec §197.4);
pass --yes to skip the interactive confirmation.
`;

const SET_KEYS = ['discoverable', 'indexable', 'show-in-local-feed', 'locked'] as const;
type SetKey = (typeof SET_KEYS)[number];

const FIELD_MASK: Readonly<Record<SetKey, string>> = {
  discoverable: 'discoverable',
  indexable: 'indexable',
  'show-in-local-feed': 'show_in_local_feed',
  locked: 'locked',
};

export interface PrivacyCommandApi {
  getNodePolicy: () => Promise<GetNodePolicyResponse>;
  getPrivacyPrefs: (accessToken: string) => Promise<GetPrivacyPrefsResponse>;
  acknowledgePrivacyNotice: (
    request: AcknowledgePrivacyNoticeRequest,
    accessToken: string,
  ) => Promise<AcknowledgePrivacyNoticeResponse>;
  updatePrivacyPrefs: (
    request: UpdatePrivacyPrefsRequest,
    accessToken: string,
  ) => Promise<UpdatePrivacyPrefsResponse>;
  exportAccount: (accessToken: string) => Promise<ExportAccountResponse>;
  getExportStatus: (accessToken: string) => Promise<GetExportStatusResponse>;
  requestAccountDeletion: (accessToken: string) => Promise<RequestAccountDeletionResponse>;
  cancelAccountDeletion: (accessToken: string) => Promise<CancelAccountDeletionResponse>;
  getDeletionStatus: (accessToken: string) => Promise<GetDeletionStatusResponse>;
}

export interface PrivacyCliDeps {
  io: CliIo;
  env: NodeJS.ProcessEnv;
  target: string;
  insecure: boolean;
  /** Test/embedding seam; omitted by the executable, which builds real gRPC clients. */
  api?: PrivacyCommandApi | undefined;
  ensureAccessToken?: (() => Promise<string>) | undefined;
}

interface CommandContext {
  api: PrivacyCommandApi;
  ensureAccessToken: () => Promise<string>;
  close: () => void;
}

const SUBCOMMANDS = ['show', 'set', 'ack', 'export', 'delete', 'cancel-delete'] as const;

export async function runPrivacy(rest: readonly string[], deps: PrivacyCliDeps): Promise<number> {
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
    deps.io.stderr(`Unknown privacy subcommand: ${subcommand}\n\n${USAGE}`);
    return 1;
  }

  const context = deps.api === undefined ? createContext(deps, rest) : injectedContext(deps);
  try {
    if (subcommand === 'show') return runShow(deps, context);
    if (subcommand === 'set') return runSet(options, deps, context);
    if (subcommand === 'ack') return runAck(deps, context);
    if (subcommand === 'export') return runExport(deps, context);
    if (subcommand === 'delete') return runDelete(options, deps, context);
    return runCancelDelete(deps, context);
  } catch (error) {
    reportAuthError(deps.io, error, deps.target);
    return 1;
  } finally {
    context.close();
  }
}

async function runShow(deps: PrivacyCliDeps, context: CommandContext): Promise<number> {
  const policyResponse = await context.api.getNodePolicy();
  const accessToken = await context.ensureAccessToken();
  const [prefsResponse, exportResponse, deletionResponse] = await Promise.all([
    context.api.getPrivacyPrefs(accessToken),
    context.api.getExportStatus(accessToken),
    context.api.getDeletionStatus(accessToken),
  ]);

  const policy = policyResponse.policy;
  deps.io.stdout(`privacy-notice-version\t${String(policy?.privacyNoticeVersion ?? 0)}\n`);
  deps.io.stdout(
    `privacy-notice-summary\t${sanitizeForTerminal(policy?.privacyNoticeSummary ?? '')}\n`,
  );

  const prefs = prefsResponse.prefs;
  if (present(prefs)) {
    deps.io.stdout(`discoverable\t${String(prefs.discoverable)}\n`);
    deps.io.stdout(`indexable\t${String(prefs.indexable)}\n`);
    deps.io.stdout(`show-in-local-feed\t${String(prefs.showInLocalFeed)}\n`);
    deps.io.stdout(`locked\t${String(prefs.locked)}\n`);
    deps.io.stdout(
      `privacy-notice-acknowledged\t${String(present(prefs.privacyNoticeAcknowledgedAt))}\n`,
    );
  }

  const exportInfo = exportResponse.export;
  deps.io.stdout(`export-status\t${present(exportInfo) ? exportInfo.status : 'NONE'}\n`);
  if (present(exportInfo) && exportInfo.downloadUrl !== '') {
    deps.io.stdout(`export-url\t${sanitizeForTerminal(exportInfo.downloadUrl)}\n`);
  }

  const deletion = deletionResponse.deletion;
  deps.io.stdout(`deletion-pending\t${String(deletion?.pending ?? false)}\n`);
  return 0;
}

async function runSet(
  rest: readonly string[],
  deps: PrivacyCliDeps,
  context: CommandContext,
): Promise<number> {
  const [key, value, extra] = rest;
  if (key === undefined || value === undefined || extra !== undefined) {
    deps.io.stderr(`privacy set needs exactly a key and on/off.\n\n${USAGE}`);
    return 1;
  }
  if (!(SET_KEYS as readonly string[]).includes(key)) {
    deps.io.stderr(`Unknown privacy key: ${key}\n\n${USAGE}`);
    return 1;
  }
  if (value !== 'on' && value !== 'off') {
    deps.io.stderr(`privacy set expects on or off, got: ${value}\n`);
    return 1;
  }

  const accessToken = await context.ensureAccessToken();
  const current = await context.api.getPrivacyPrefs(accessToken);
  const prefs = current.prefs;
  if (!present(prefs)) {
    deps.io.stderr('Could not read your current privacy preferences.\n');
    return 1;
  }
  const typedKey = key as SetKey;
  const next = value === 'on';
  const response = await context.api.updatePrivacyPrefs(
    {
      discoverable: typedKey === 'discoverable' ? next : prefs.discoverable,
      indexable: typedKey === 'indexable' ? next : prefs.indexable,
      showInLocalFeed: typedKey === 'show-in-local-feed' ? next : prefs.showInLocalFeed,
      locked: typedKey === 'locked' ? next : prefs.locked,
      updateMask: [FIELD_MASK[typedKey]],
    },
    accessToken,
  );
  void response;
  deps.io.stdout(`${key} ${value}\n`);
  return 0;
}

async function runAck(deps: PrivacyCliDeps, context: CommandContext): Promise<number> {
  const policyResponse = await context.api.getNodePolicy();
  const accessToken = await context.ensureAccessToken();
  await context.api.acknowledgePrivacyNotice(
    { noticeVersion: policyResponse.policy?.privacyNoticeVersion ?? 0 },
    accessToken,
  );
  deps.io.stdout(
    `Acknowledged privacy notice v${String(policyResponse.policy?.privacyNoticeVersion ?? 0)}.\n`,
  );
  return 0;
}

async function runExport(deps: PrivacyCliDeps, context: CommandContext): Promise<number> {
  const accessToken = await context.ensureAccessToken();
  const response = await context.api.exportAccount(accessToken);
  const exportInfo = response.export;
  deps.io.stdout(`export-status\t${present(exportInfo) ? exportInfo.status : 'NONE'}\n`);
  return 0;
}

async function runDelete(
  rest: readonly string[],
  deps: PrivacyCliDeps,
  context: CommandContext,
): Promise<number> {
  const confirmed = rest.includes('--yes');
  if (!confirmed) {
    if (!deps.io.isTTY) {
      deps.io.stderr('Refusing to delete without --yes on a non-interactive terminal.\n');
      return 1;
    }
    const answer = await deps.io.prompt(
      'This deletes your account after this node’s grace period. Type "yes" to continue: ',
    );
    if (answer.trim().toLowerCase() !== 'yes') {
      deps.io.stdout('Cancelled.\n');
      return 0;
    }
  }
  const accessToken = await context.ensureAccessToken();
  const response = await context.api.requestAccountDeletion(accessToken);
  deps.io.stdout(`deletion-pending\t${String(response.deletion?.pending ?? true)}\n`);
  return 0;
}

async function runCancelDelete(deps: PrivacyCliDeps, context: CommandContext): Promise<number> {
  const accessToken = await context.ensureAccessToken();
  const response = await context.api.cancelAccountDeletion(accessToken);
  deps.io.stdout(`deletion-pending\t${String(response.deletion?.pending ?? false)}\n`);
  return 0;
}

function injectedContext(deps: PrivacyCliDeps): CommandContext {
  const api = deps.api;
  if (api === undefined) throw new Error('Privacy API is unavailable.');
  return {
    api,
    ensureAccessToken:
      deps.ensureAccessToken ??
      (() => Promise.reject(new Error('Not signed in. Run `patches login`.'))),
    close: () => undefined,
  };
}

function createContext(deps: PrivacyCliDeps, rest: readonly string[]): CommandContext {
  const channelCredentials = deps.insecure ? credentials.createInsecure() : credentials.createSsl();
  const privacy = createPrivacyClient(deps.target, channelCredentials);
  const node = createNodeClient(deps.target, channelCredentials);
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
    api: grpcApi(privacy, node),
    ensureAccessToken,
    close: () => {
      privacy.close();
      node.close();
      authApi.close();
    },
  };
}

function grpcApi(privacy: PrivacyGrpcClient, node: NodeGrpcClient): PrivacyCommandApi {
  return {
    getNodePolicy: () => unary(node.getNodePolicy.bind(node), {}),
    getPrivacyPrefs: (token) => unary(privacy.getPrivacyPrefs.bind(privacy), {}, token),
    acknowledgePrivacyNotice: (request, token) =>
      unary(privacy.acknowledgePrivacyNotice.bind(privacy), request, token),
    updatePrivacyPrefs: (request, token) =>
      unary(privacy.updatePrivacyPrefs.bind(privacy), request, token),
    exportAccount: (token) => unary(privacy.exportAccount.bind(privacy), {}, token),
    getExportStatus: (token) => unary(privacy.getExportStatus.bind(privacy), {}, token),
    requestAccountDeletion: (token) =>
      unary(privacy.requestAccountDeletion.bind(privacy), {}, token),
    cancelAccountDeletion: (token) => unary(privacy.cancelAccountDeletion.bind(privacy), {}, token),
    getDeletionStatus: (token) => unary(privacy.getDeletionStatus.bind(privacy), {}, token),
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

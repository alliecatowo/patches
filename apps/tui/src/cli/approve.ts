import { createPatchesApi } from '@patches/client';

import { CLIENT_NAME, TUI_VERSION } from '../version.js';
import { createGrpcTransport } from '../api/transport.js';

import {
  createApi,
  newSessionManager,
  openCredentialStore,
  reportAuthError,
} from './auth-shared.js';
import type { CliIo } from './io.js';

const USAGE = `Usage: patches approve <code>

Approves a "sign in from your browser" device link (P15-005): the browser
shows a short code (e.g. ABCD-1234), you type it here from a terminal
that is already signed in, and the browser receives a session for THIS
account. There is no central SSO involved — this node is only relaying
between two of your own devices.

Options:
  --node, --server <host:port>  node to act against
  --yes                          skip the confirmation prompt (for scripts;
                                  the code was already shown to you elsewhere)
  -h, --help                     show this message
`;

export interface ApproveDeps {
  io: CliIo;
  env: NodeJS.ProcessEnv;
  target: string;
  insecure: boolean;
}

/**
 * `patches approve <code>` (P15-005).
 *
 * Deliberately does not go through `PatchesApi` (`apps/tui/src/api/client.ts`): that class's
 * method table (`buildMethods`) has no `approveDeviceLink` entry, and that file is owned by a
 * different task (ADR 0023 P10-013) — see this task's report for the follow-up to fold this
 * in once that table gets one. Until then this builds its own `@patches/client` SDK instance
 * (the same `createGrpcTransport` `PatchesApi` uses) and calls `sdk.auth.approveDeviceLink`
 * directly — a full Connect client for `AuthService` already has every RPC the proto defines,
 * `buildMethods` just doesn't expose this one as a `PatchesApi` convenience method yet.
 */
export async function runApprove(rest: readonly string[], deps: ApproveDeps): Promise<number> {
  const { io, env, target, insecure } = deps;

  const args = rest.filter((argument) => argument !== '--yes');
  const skipConfirm = rest.includes('--yes');
  const [first] = args;

  if (first === '-h' || first === '--help') {
    io.stdout(USAGE);
    return 0;
  }

  const rawCode = first;
  if (rawCode === undefined || rawCode === '' || rawCode.startsWith('-')) {
    io.stderr(`A device-link code is required: patches approve <code>\n\n${USAGE}`);
    return 1;
  }

  const api = createApi(target, insecure);
  try {
    const store = await openCredentialStore(io, env, rest);
    const manager = newSessionManager(api, store, target);
    const session = await manager.restore();
    if (session === undefined) {
      io.stderr(`Not signed in on ${target}. Run \`patches login\` first.\n`);
      return 1;
    }

    // Show what's about to be approved and require an explicit yes before it happens (spec:
    // nothing server-side can tell "the account holder approving their own login" apart from
    // "someone talked into approving a stranger's" — this prompt is the whole defense against
    // the second case).
    const handle = session.actor?.handle ?? '?';
    io.stdout(`This will sign in a browser as @${handle} on ${target}, using code ${rawCode}.\n`);
    if (!skipConfirm) {
      if (!io.isTTY) {
        io.stderr(
          'Refusing to approve without confirmation (no terminal to prompt with) — pass --yes if you meant to.\n',
        );
        return 1;
      }
      const answer = (await io.prompt('Approve this sign-in? [y/N] ')).trim().toLowerCase();
      if (!answer.startsWith('y')) {
        io.stdout('Not approved.\n');
        return 0;
      }
    }

    const accessToken = await manager.ensureAccessToken();
    await approveDeviceLink(target, insecure, rawCode, accessToken);

    io.stdout('Approved — check the browser, it should sign in shortly.\n');
    return 0;
  } catch (error) {
    reportAuthError(io, error, target);
    return 1;
  } finally {
    api.close();
  }
}

async function approveDeviceLink(
  target: string,
  insecure: boolean,
  userCode: string,
  accessToken: string,
): Promise<void> {
  const sdk = createPatchesApi({
    transport: createGrpcTransport({ target, insecure }),
    clientName: CLIENT_NAME,
    clientVersion: TUI_VERSION,
  });
  await sdk.auth.approveDeviceLink(
    { userCode },
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
}

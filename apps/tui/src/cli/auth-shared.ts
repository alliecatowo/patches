import { PatchesApi } from '../api/client.js';
import { describeGrpcError } from '../api/errors.js';
import { createDefaultCredentialStore, type CredentialStore } from '../auth/credential-store.js';
import { SessionManager } from '../auth/session.js';
import {
  formatOpenSshPublicKey,
  listSelectableIdentities,
  readPublicKeyFile,
  selectIdentity,
  sshFingerprint,
  type SelectableIdentity,
} from '../auth/ssh-login.js';
import { sshAuthSock } from '../auth/ssh-agent.js';
import type { CliIo } from './io.js';

/** `--allow-insecure-credential-file` / `PATCHES_ALLOW_INSECURE_CREDENTIAL_FILE=1` (spec §37). */
export function isAllowInsecureCredentialFile(
  rest: readonly string[],
  env: NodeJS.ProcessEnv,
): boolean {
  if (rest.includes('--allow-insecure-credential-file')) return true;
  const value = env.PATCHES_ALLOW_INSECURE_CREDENTIAL_FILE;
  return value !== undefined && value.trim() === '1';
}

export async function openCredentialStore(
  io: CliIo,
  env: NodeJS.ProcessEnv,
  rest: readonly string[] = [],
): Promise<CredentialStore> {
  return createDefaultCredentialStore({
    allowInsecureFile: isAllowInsecureCredentialFile(rest, env),
    warn: (message) => {
      io.stderr(message);
    },
  });
}

export function newSessionManager(
  api: PatchesApi,
  store: CredentialStore,
  nodeOrigin: string,
): SessionManager {
  return new SessionManager({ api, store, nodeOrigin });
}

/**
 * Prints `describeGrpcError`'s title/hint the way every auth subcommand reports a
 * failure. `context: 'credentials'` (B-016) is passed by `login`/`register`, whose
 * failures are always "the credentials you gave were wrong", never "your session
 * expired" — there is no existing session to expire during either command.
 */
export function reportAuthError(
  io: CliIo,
  error: unknown,
  target: string,
  context?: 'credentials',
): void {
  const friendly = describeGrpcError(error, target, { context });
  io.stderr(`${friendly.title}\n`);
  if (friendly.hint !== '') io.stderr(`${friendly.hint}\n`);
}

/**
 * Resolves `--ssh-key <path|fingerprint>` (or, with none given, the sole
 * loaded identity) against the running agent's identities — the key picker
 * (spec §166 enrollment/login is always an explicit choice, never a silent
 * guess when more than one identity is available).
 */
export async function resolveSshIdentity(
  selector: string | undefined,
  env: NodeJS.ProcessEnv,
): Promise<
  { identity: SelectableIdentity; publicKeyOpenssh: string; socketPath: string } | { error: string }
> {
  const socketPath = sshAuthSock(env);
  if (socketPath === undefined) {
    return { error: 'No SSH agent is running (SSH_AUTH_SOCK is not set).' };
  }

  // A filesystem path narrows the search to one fingerprint (read-only, for
  // enrollment/matching — the private key itself is never read).
  let resolvedSelector = selector;
  if (
    selector !== undefined &&
    (selector.startsWith('/') || selector.startsWith('~') || selector.startsWith('./'))
  ) {
    try {
      const parsed = await readPublicKeyFile(selector);
      resolvedSelector = sshFingerprint(parsed.blob);
    } catch (error) {
      return { error: `Could not read public key file ${selector}: ${(error as Error).message}` };
    }
  }

  let identities: SelectableIdentity[];
  try {
    identities = await listSelectableIdentities(socketPath);
  } catch (error) {
    return { error: `Could not reach the SSH agent: ${(error as Error).message}` };
  }
  if (identities.length === 0) {
    return { error: 'The SSH agent has no identities loaded (try `ssh-add`).' };
  }

  const identity = selectIdentity(identities, resolvedSelector);
  if (identity === undefined) {
    const list = identities
      .map((candidate) => `  ${candidate.fingerprint}  ${candidate.comment}`)
      .join('\n');
    return {
      error:
        resolvedSelector === undefined
          ? `Multiple SSH identities are loaded — pick one with --ssh-key:\n${list}`
          : `No loaded identity matches "${resolvedSelector}". Loaded identities:\n${list}`,
    };
  }

  return {
    identity,
    publicKeyOpenssh: formatOpenSshPublicKey(
      identity.algorithm,
      identity.keyBlob,
      identity.comment,
    ),
    socketPath,
  };
}

export function createApi(target: string, insecure: boolean): PatchesApi {
  return new PatchesApi({ target, insecure });
}

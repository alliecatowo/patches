import { timestampToDate } from '@patches/proto';
import type { Credential } from '../api/wire/types.js';

import { present } from '../api/present.js';
import { sshAuthSock } from '../auth/ssh-agent.js';
import { SessionManager } from '../auth/session.js';
import {
  discoverEnrollmentCandidates,
  enrollSshCredential,
  type EnrollmentCandidate,
} from '../auth/ssh-enroll.js';
import { selectIdentity } from '../auth/ssh-login.js';
import { createApi, openCredentialStore, reportAuthError } from './auth-shared.js';
import type { CliIo } from './io.js';

const USAGE = `Usage: patches keys <add|list|remove> [options]

Manages the SSH-key credentials on the signed-in account (spec §165–166).

  patches keys add [--ssh-key <path|fingerprint>] [--label <text>] [--yes]
    Enrolls a key already loaded in your SSH agent. Never reads a private
    key — the agent signs a local proof-of-possession blob, never the key
    itself. Requires an explicit "y" confirmation, or --yes non-interactively.

  patches keys list
    Lists every credential on the account (never a secret).

  patches keys remove <fingerprint>
    Revokes the credential with that fingerprint. The server refuses to
    revoke an account's last remaining credential.

Options:
  --node, --server <host:port>  node to act against
  -h, --help                     show this message
`;

export interface KeysDeps {
  io: CliIo;
  env: NodeJS.ProcessEnv;
  target: string;
  insecure: boolean;
}

export async function runKeys(rest: readonly string[], deps: KeysDeps): Promise<number> {
  const [sub, ...rem] = rest;
  if (sub === '-h' || sub === '--help') {
    deps.io.stdout(USAGE);
    return 0;
  }
  if (sub === undefined) {
    deps.io.stderr(`A subcommand is required.\n\n${USAGE}`);
    return 1;
  }
  if (sub === 'add') return runKeysAdd(rem, deps);
  if (sub === 'list') return runKeysList(rem, deps);
  if (sub === 'remove') return runKeysRemove(rem, deps);
  deps.io.stderr(`Unknown keys subcommand: ${sub}\n\n${USAGE}`);
  return 1;
}

/** Opens the session manager and resolves an access token, or explains why not. */
async function currentAccessToken(
  deps: KeysDeps,
  rest: readonly string[],
): Promise<
  { api: ReturnType<typeof createApi>; accessToken: string; close: () => void } | { error: string }
> {
  const api = createApi(deps.target, deps.insecure);
  const store = await openCredentialStore(deps.io, deps.env, rest);
  const manager = new SessionManager({ api, store, nodeOrigin: deps.target });
  const session = await manager.restore();
  if (session === undefined) {
    api.close();
    return { error: `Not signed in on ${deps.target}. Run \`patches login\`.` };
  }
  try {
    const accessToken = await manager.ensureAccessToken();
    return { api, accessToken, close: () => api.close() };
  } catch (error) {
    api.close();
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function describeCandidate(candidate: EnrollmentCandidate): string {
  const where = candidate.knownAt.length === 0 ? '' : ` (${candidate.knownAt.join(', ')})`;
  return `${candidate.fingerprint}  ${candidate.algorithm}  ${candidate.comment}${where}`;
}

interface AddFlags {
  sshKey?: string;
  label: string;
  yes: boolean;
  help: boolean;
}

function parseAddFlags(rest: readonly string[]): AddFlags | { error: string } {
  const flags: AddFlags = { label: '', yes: false, help: false };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    switch (argument) {
      case '-h':
      case '--help':
        flags.help = true;
        break;
      case '--yes':
      case '-y':
        flags.yes = true;
        break;
      case '--ssh-key':
      case '--label': {
        const value = rest[index + 1];
        if (value === undefined) return { error: `${argument} needs a value.` };
        index += 1;
        if (argument === '--ssh-key') flags.sshKey = value;
        else flags.label = value;
        break;
      }
      default:
        return { error: `Unknown option for keys add: ${argument}` };
    }
  }
  return flags;
}

async function runKeysAdd(rest: readonly string[], deps: KeysDeps): Promise<number> {
  const { io, env } = deps;
  const parsed = parseAddFlags(rest);
  if ('error' in parsed) {
    io.stderr(`${parsed.error}\n`);
    return 1;
  }
  if (parsed.help) {
    io.stdout(USAGE);
    return 0;
  }

  const socketPath = sshAuthSock(env);
  if (socketPath === undefined) {
    io.stderr('No SSH agent is running (SSH_AUTH_SOCK is not set).\n');
    return 1;
  }

  const session = await currentAccessToken(deps, rest);
  if ('error' in session) {
    io.stderr(`${session.error}\n`);
    return 1;
  }

  try {
    let candidates: EnrollmentCandidate[];
    try {
      candidates = await discoverEnrollmentCandidates(socketPath);
    } catch (error) {
      io.stderr(`Could not reach the SSH agent: ${(error as Error).message}\n`);
      return 1;
    }
    if (candidates.length === 0) {
      io.stderr('The SSH agent has no identities loaded (try `ssh-add`).\n');
      return 1;
    }

    const candidate = selectIdentity(candidates, parsed.sshKey);
    if (candidate === undefined) {
      const list = candidates.map((entry) => `  ${describeCandidate(entry)}`).join('\n');
      io.stderr(
        parsed.sshKey === undefined
          ? `Multiple SSH identities are loaded — pick one with --ssh-key:\n${list}\n`
          : `No loaded identity matches "${parsed.sshKey}". Loaded identities:\n${list}\n`,
      );
      return 1;
    }

    io.stdout(`About to enroll:\n  ${describeCandidate(candidate)}\n`);
    if (!parsed.yes) {
      if (!io.isTTY) {
        io.stderr('Confirmation required — pass --yes (no terminal to prompt with).\n');
        return 1;
      }
      const answer = (await io.prompt('Enroll this key? [y/N] ')).trim().toLowerCase();
      if (answer !== 'y' && answer !== 'yes') {
        io.stdout('Cancelled.\n');
        return 1;
      }
    }

    const { credential } = await enrollSshCredential({
      api: {
        beginSshEnrollment: (request, accessToken) =>
          session.api.beginSshEnrollment(request, accessToken),
        addCredential: (request, accessToken) => session.api.addCredential(request, accessToken),
      },
      accessToken: session.accessToken,
      nodeDomain: deps.target,
      socketPath,
      identity: candidate,
      label: parsed.label,
    });
    io.stdout(
      `Enrolled ${present(credential) ? credential.identifier : candidate.fingerprint} on ${deps.target}.\n`,
    );
    return 0;
  } catch (error) {
    reportAuthError(io, error, deps.target);
    return 1;
  } finally {
    session.close();
  }
}

async function runKeysList(rest: readonly string[], deps: KeysDeps): Promise<number> {
  const { io } = deps;
  const session = await currentAccessToken(deps, rest);
  if ('error' in session) {
    io.stderr(`${session.error}\n`);
    return 1;
  }
  try {
    const { credentials } = await session.api.listCredentials(session.accessToken);
    if (credentials.length === 0) {
      io.stdout('No credentials on this account.\n');
      return 0;
    }
    for (const credential of credentials) io.stdout(`${describeCredentialRow(credential)}\n`);
    return 0;
  } catch (error) {
    reportAuthError(io, error, deps.target);
    return 1;
  } finally {
    session.close();
  }
}

function describeCredentialRow(credential: Credential): string {
  const createdAt = timestampToDate(credential.createdAt);
  const label = credential.label === '' ? '(no label)' : credential.label;
  const identifier = credential.identifier === '' ? '' : `  ${credential.identifier}`;
  return `${credential.type}  ${label}${identifier}  since ${createdAt?.toISOString() ?? 'unknown'}`;
}

async function runKeysRemove(rest: readonly string[], deps: KeysDeps): Promise<number> {
  const { io } = deps;
  const [fingerprint] = rest;
  if (fingerprint === undefined || fingerprint.startsWith('-')) {
    io.stderr(`A fingerprint is required: patches keys remove <fingerprint>\n`);
    return 1;
  }

  const session = await currentAccessToken(deps, rest);
  if ('error' in session) {
    io.stderr(`${session.error}\n`);
    return 1;
  }
  try {
    const { credentials } = await session.api.listCredentials(session.accessToken);
    const credential = credentials.find(
      (candidate) =>
        candidate.identifier === fingerprint || candidate.identifier.endsWith(fingerprint),
    );
    if (credential === undefined) {
      io.stderr(`No credential matches "${fingerprint}".\n`);
      return 1;
    }
    await session.api.revokeCredential({ id: credential.id }, session.accessToken);
    io.stdout(`Removed ${describeCredentialRow(credential)}.\n`);
    return 0;
  } catch (error) {
    reportAuthError(io, error, deps.target);
    return 1;
  } finally {
    session.close();
  }
}

import { randomUUID } from 'node:crypto';

import { SessionManager } from '../auth/session.js';
import {
  createApi,
  openCredentialStore,
  reportAuthError,
  resolveSshIdentity,
} from './auth-shared.js';
import type { CliIo } from './io.js';

export interface RegisterFlags {
  email?: string;
  handle?: string;
  displayName?: string;
  password?: string;
  passwordStdin: boolean;
  invite?: string;
  sshKey?: string;
  help: boolean;
}

const USAGE = `Usage: patches register [options]

Creates an account on a node (spec §38). Any flag left out is prompted for
interactively, when connected to a terminal.

Options:
  --node, --server <host:port>  node to register on
  --email <address>             recovery email (optional unless the node requires it)
  --handle <handle>             desired handle, 3-30 chars
  --display-name <name>         display name shown on posts
  --password-stdin              read the password from stdin instead of prompting
  --invite <code>                invite code, if the node requires one
  --ssh-key <path|fingerprint>  also enroll an SSH key as a login credential
  -h, --help                     show this message
`;

export function parseRegisterFlags(rest: readonly string[]): RegisterFlags | { error: string } {
  const flags: RegisterFlags = { passwordStdin: false, help: false };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    switch (argument) {
      case '-h':
      case '--help':
        flags.help = true;
        break;
      case '--password-stdin':
        flags.passwordStdin = true;
        break;
      case '--email':
      case '--handle':
      case '--display-name':
      case '--invite':
      case '--ssh-key': {
        const value = rest[index + 1];
        if (value === undefined) return { error: `${argument} needs a value.` };
        index += 1;
        if (argument === '--email') flags.email = value;
        else if (argument === '--handle') flags.handle = value;
        else if (argument === '--display-name') flags.displayName = value;
        else if (argument === '--invite') flags.invite = value;
        else flags.sshKey = value;
        break;
      }
      default:
        return { error: `Unknown option for register: ${argument}` };
    }
  }
  return flags;
}

export interface RegisterDeps {
  io: CliIo;
  env: NodeJS.ProcessEnv;
  target: string;
  insecure: boolean;
}

export async function runRegister(rest: readonly string[], deps: RegisterDeps): Promise<number> {
  const { io, env, target, insecure } = deps;
  const parsed = parseRegisterFlags(rest);
  if ('error' in parsed) {
    io.stderr(`${parsed.error}\n`);
    return 1;
  }
  if (parsed.help) {
    io.stdout(USAGE);
    return 0;
  }

  const canPrompt = io.isTTY;
  const email = parsed.email ?? (canPrompt ? await io.prompt('email (optional): ') : '');
  const handle = parsed.handle ?? (canPrompt ? await io.prompt('handle: ') : undefined);
  const displayName =
    parsed.displayName ?? (canPrompt ? await io.prompt('display name: ') : undefined);
  const invite = parsed.invite ?? (canPrompt ? await io.prompt('invite code: ') : '');
  const password = parsed.passwordStdin
    ? await io.readStdin()
    : (parsed.password ?? (canPrompt ? await io.promptPassword('password: ') : undefined));

  if (handle === undefined || handle.trim() === '') {
    io.stderr('A handle is required: pass --handle, or run this interactively.\n');
    return 1;
  }
  if (password === undefined || password === '') {
    io.stderr('A password is required: pass --password-stdin, or run this interactively.\n');
    return 1;
  }

  let sshPublicKey = '';
  if (parsed.sshKey !== undefined) {
    const resolved = await resolveSshIdentity(parsed.sshKey, env);
    if ('error' in resolved) {
      io.stderr(`${resolved.error}\n`);
      return 1;
    }
    sshPublicKey = resolved.publicKeyOpenssh;
  }

  const api = createApi(target, insecure);
  try {
    // Shown before the account is ever created (spec §197.1) — a record that the text
    // was displayed, never a waiver of anything beyond what it describes, and never a
    // gate on registration itself (registration proceeds even if the notice is empty).
    try {
      const { policy } = await api.getNodePolicy();
      const summary = policy?.privacyNoticeSummary ?? '';
      io.stdout(
        `Privacy notice (v${String(policy?.privacyNoticeVersion ?? 0)}): ${
          summary === '' ? 'this node publishes no privacy notice.' : summary
        }\n`,
      );
      if (canPrompt) {
        const answer = await io.prompt('Continue registering? [y/N] ');
        if (answer.trim().toLowerCase() !== 'y') {
          io.stdout('Cancelled.\n');
          return 0;
        }
      }
    } catch {
      // The node is unreachable for policy purposes only — the register call right
      // below will surface the same problem with a proper error, so this is not
      // worth failing the command over on its own.
    }

    const store = await openCredentialStore(io, env, rest);
    const manager = new SessionManager({ api, store, nodeOrigin: target });
    const session = await manager.register({
      email,
      handle: handle.trim(),
      displayName: displayName ?? handle.trim(),
      password,
      inviteCode: invite,
      clientRequestId: randomUUID(),
      sshPublicKey,
    });
    io.stdout(`Registered as @${session.actor?.handle ?? handle}. Logged in on ${target}.\n`);
    return 0;
  } catch (error) {
    reportAuthError(io, error, target, 'credentials');
    return 1;
  } finally {
    api.close();
  }
}

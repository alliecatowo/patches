import { createApi, openCredentialStore } from './auth-shared.js';
import type { CliIo } from './io.js';

export interface LogoutFlags {
  all: boolean;
  userId?: string;
  help: boolean;
}

const USAGE = `Usage: patches logout [options]

Signs out of the account stored for the target node (spec §37).

Options:
  --node, --server <host:port>  node to sign out of
  --all                          sign out of every account stored on this machine
  --user <id>                    disambiguate when more than one account is stored for a node
  -h, --help                     show this message
`;

export function parseLogoutFlags(rest: readonly string[]): LogoutFlags | { error: string } {
  const flags: LogoutFlags = { all: false, help: false };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    switch (argument) {
      case '-h':
      case '--help':
        flags.help = true;
        break;
      case '--all':
        flags.all = true;
        break;
      case '--user': {
        const value = rest[index + 1];
        if (value === undefined) return { error: '--user needs a value.' };
        flags.userId = value;
        index += 1;
        break;
      }
      default:
        return { error: `Unknown option for logout: ${argument}` };
    }
  }
  return flags;
}

export interface LogoutDeps {
  io: CliIo;
  env: NodeJS.ProcessEnv;
  target: string;
  insecure: boolean;
}

export async function runLogout(rest: readonly string[], deps: LogoutDeps): Promise<number> {
  const { io, env, target, insecure } = deps;
  const parsed = parseLogoutFlags(rest);
  if ('error' in parsed) {
    io.stderr(`${parsed.error}\n`);
    return 1;
  }
  if (parsed.help) {
    io.stdout(USAGE);
    return 0;
  }

  const store = await openCredentialStore(io, env, rest);

  if (parsed.all) {
    // Local-only: `--all` may span several different nodes, and best-effort
    // server-side revocation per node (each with its own TLS/target) is more
    // than a one-flag CLI command should take on. Follow-up: per-node revoke.
    const accounts = await store.list();
    if (accounts.length === 0) {
      io.stdout('No accounts stored on this machine.\n');
      return 0;
    }
    for (const account of accounts) {
      await store.delete(account.nodeOrigin, account.userId);
    }
    io.stdout(`Signed out of ${String(accounts.length)} account(s).\n`);
    return 0;
  }

  const stored = await store.get(target, parsed.userId);
  if (stored === undefined) {
    io.stderr(
      parsed.userId === undefined
        ? `No single stored account for ${target} (pass --user, or --all).\n`
        : `No stored account ${parsed.userId} for ${target}.\n`,
    );
    return 1;
  }

  const api = createApi(target, insecure);
  try {
    // Best-effort server-side revoke: local logout must still succeed even if
    // the node is unreachable, since a token nobody can reach cannot be misused
    // via this client again either way, and the user's obvious intent — stop
    // being signed in here — must not be blocked on network access.
    try {
      await api.logout({ refreshToken: stored.refreshToken });
    } catch (error) {
      io.stderr(`(could not reach ${target} to revoke server-side — signing out locally anyway)\n`);
      void error;
    }
    await store.delete(target, stored.userId);
    io.stdout(`Signed out of @${stored.actorHandle} on ${target}.\n`);
    return 0;
  } finally {
    api.close();
  }
}

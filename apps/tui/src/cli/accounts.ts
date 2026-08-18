import { openCredentialStore } from './auth-shared.js';
import type { CliIo } from './io.js';

export interface AccountsDeps {
  io: CliIo;
  env: NodeJS.ProcessEnv;
}

/** `patches accounts` — lists every account stored on this machine (spec §7 of docs/architecture/auth.md). */
export async function runAccounts(rest: readonly string[], deps: AccountsDeps): Promise<number> {
  const { io, env } = deps;
  const store = await openCredentialStore(io, env, rest);
  const accounts = await store.list();

  if (accounts.length === 0) {
    io.stdout('No accounts stored on this machine. Run `patches register` or `patches login`.\n');
    return 0;
  }

  for (const account of accounts) {
    io.stdout(`@${account.actorHandle}  ${account.nodeOrigin}  (user ${account.userId})\n`);
  }
  return 0;
}

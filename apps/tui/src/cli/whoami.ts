import { createApi, openCredentialStore, reportAuthError } from './auth-shared.js';
import { SessionManager } from '../auth/session.js';
import type { CliIo } from './io.js';

export interface WhoamiDeps {
  io: CliIo;
  env: NodeJS.ProcessEnv;
  target: string;
  insecure: boolean;
}

/** `patches whoami` — who the client is signed in as on `target` (spec §7 of docs/architecture/auth.md). */
export async function runWhoami(rest: readonly string[], deps: WhoamiDeps): Promise<number> {
  const { io, env, target, insecure } = deps;
  const store = await openCredentialStore(io, env, rest);
  const api = createApi(target, insecure);

  try {
    const manager = new SessionManager({ api, store, nodeOrigin: target });
    const session = await manager.restore();
    if (session === undefined) {
      io.stderr(`Not signed in on ${target}. Run \`patches login\`.\n`);
      return 1;
    }
    io.stdout(
      `@${session.actor?.handle ?? '?'} on ${target} (email ${session.emailVerified ? 'verified' : 'unverified'})\n`,
    );
    return 0;
  } catch (error) {
    reportAuthError(io, error, target);
    return 1;
  } finally {
    api.close();
  }
}

import { SessionManager } from '../auth/session.js';
import { createApi, openCredentialStore, reportAuthError } from './auth-shared.js';
import type { CliIo } from './io.js';

const USAGE = `Usage: patches recovery-codes [--yes]

Mints a fresh set of 10 single-use recovery codes for the signed-in account
(P15-003, spec §165) — printed exactly once, right here; this node never
shows them again. Regenerating immediately invalidates every code from any
previous batch, so print or store the new set before closing this terminal.

Use one later with: patches login --recovery

Pass --yes to skip the interactive confirmation when a previous batch may
already be in use.
`;

export interface RecoveryCodesDeps {
  io: CliIo;
  env: NodeJS.ProcessEnv;
  target: string;
  insecure: boolean;
}

export async function runRecoveryCodes(
  rest: readonly string[],
  deps: RecoveryCodesDeps,
): Promise<number> {
  const { io, env, target, insecure } = deps;
  if (rest.includes('-h') || rest.includes('--help')) {
    io.stdout(USAGE);
    return 0;
  }
  const skipConfirm = rest.includes('--yes');

  if (!skipConfirm && io.isTTY) {
    const answer = (
      await io.prompt(
        'This replaces any recovery codes you generated before — they will stop working. Continue? (y/N) ',
      )
    )
      .trim()
      .toLowerCase();
    if (!answer.startsWith('y')) {
      io.stdout('Cancelled.\n');
      return 0;
    }
  }

  const api = createApi(target, insecure);
  try {
    const store = await openCredentialStore(io, env, rest);
    const manager = new SessionManager({ api, store, nodeOrigin: target });
    const session = await manager.restore();
    if (session === undefined) {
      io.stderr(`Not signed in on ${target}. Run \`patches login\`.\n`);
      return 1;
    }

    const accessToken = await manager.ensureAccessToken();
    const { codes } = await api.generateRecoveryCodes(accessToken);

    io.stdout('Your new recovery codes (each works once):\n\n');
    for (const code of codes) io.stdout(`  ${code}\n`);
    io.stdout(
      '\nStore these somewhere safe — this node will not show them again. ' +
        'Use one with: patches login --recovery\n',
    );
    return 0;
  } catch (error) {
    reportAuthError(io, error, target);
    return 1;
  } finally {
    api.close();
  }
}

import { createApi, openCredentialStore, reportAuthError } from './auth-shared.js';
import { SessionManager } from '../auth/session.js';
import type { CliIo } from './io.js';

const USAGE = `Usage: patches verify <code>
       patches verify --resend

Confirms the caller's email address with the code the verification email
carried, or (--resend) asks the server to send a new one.

  patches verify <code>
    Unauthenticated — the code itself is the proof (spec §37/§165).

  patches verify --resend
    Requires an existing session (\`patches login\` first) — resends to
    whichever address is on the signed-in account.

Options:
  --node, --server <host:port>  node to act against
  -h, --help                     show this message
`;

export interface VerifyDeps {
  io: CliIo;
  env: NodeJS.ProcessEnv;
  target: string;
  insecure: boolean;
}

/** `patches verify <code>` / `patches verify --resend` (A-028). */
export async function runVerify(rest: readonly string[], deps: VerifyDeps): Promise<number> {
  const { io, target, insecure } = deps;
  const [first] = rest;

  if (first === '-h' || first === '--help') {
    io.stdout(USAGE);
    return 0;
  }

  if (first === '--resend') return runResend(rest, deps);

  const code = first;
  if (code === undefined || code === '' || code.startsWith('-')) {
    io.stderr(`A verification code is required: patches verify <code>\n\n${USAGE}`);
    return 1;
  }

  const api = createApi(target, insecure);
  try {
    const response = await api.verifyEmail({ code });
    if (!response.emailVerified) {
      io.stderr('That code did not verify your email — check it and try again.\n');
      return 1;
    }
    io.stdout('Email verified.\n');
    return 0;
  } catch (error) {
    reportAuthError(io, error, target);
    return 1;
  } finally {
    api.close();
  }
}

async function runResend(rest: readonly string[], deps: VerifyDeps): Promise<number> {
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
    const accessToken = await manager.ensureAccessToken();
    await api.resendVerification(accessToken);
    io.stdout('Verification email sent.\n');
    return 0;
  } catch (error) {
    reportAuthError(io, error, target);
    return 1;
  } finally {
    api.close();
  }
}

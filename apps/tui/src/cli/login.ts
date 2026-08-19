import { performSshLogin } from '../auth/ssh-login.js';
import { SessionManager } from '../auth/session.js';
import {
  createApi,
  openCredentialStore,
  reportAuthError,
  resolveSshIdentity,
} from './auth-shared.js';
import type { CliIo } from './io.js';

export interface LoginFlags {
  ssh: boolean;
  password: boolean;
  /** P15-003: `patches login --recovery` — redeems a single-use recovery code instead of a
   * password. */
  recovery: boolean;
  emailOrHandle?: string;
  passwordValue?: string;
  passwordStdin: boolean;
  /** The recovery code itself, for `--recovery`; read via `--password-stdin`/prompt otherwise
   * (a recovery code is exactly as sensitive as a password — same input handling). */
  codeValue?: string;
  sshKey?: string;
  help: boolean;
}

const USAGE = `Usage: patches login [options]

Signs in with a password, an SSH key, or a recovery code (spec §33, §166, P15-003).

Options:
  --node, --server <host:port>  node to sign in to
  --ssh                          use SSH-key login
  --password                     use password login
  --recovery                     use a recovery code instead of a password
  --email-or-handle <value>     handle or recovery email, for --password/--recovery
  --password-stdin              read the password (or recovery code) from stdin instead of prompting
  --ssh-key <path|fingerprint>  which loaded SSH identity to sign with
  -h, --help                     show this message
`;

export function parseLoginFlags(rest: readonly string[]): LoginFlags | { error: string } {
  const flags: LoginFlags = {
    ssh: false,
    password: false,
    recovery: false,
    passwordStdin: false,
    help: false,
  };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    switch (argument) {
      case '-h':
      case '--help':
        flags.help = true;
        break;
      case '--ssh':
        flags.ssh = true;
        break;
      case '--password':
        flags.password = true;
        break;
      case '--recovery':
        flags.recovery = true;
        break;
      case '--password-stdin':
        flags.passwordStdin = true;
        break;
      case '--email-or-handle':
      case '--ssh-key': {
        const value = rest[index + 1];
        if (value === undefined) return { error: `${argument} needs a value.` };
        index += 1;
        if (argument === '--email-or-handle') flags.emailOrHandle = value;
        else flags.sshKey = value;
        break;
      }
      default:
        return { error: `Unknown option for login: ${argument}` };
    }
  }
  if ([flags.ssh, flags.password, flags.recovery].filter(Boolean).length > 1) {
    return { error: 'Pass only one of --ssh / --password / --recovery.' };
  }
  return flags;
}

export interface LoginDeps {
  io: CliIo;
  env: NodeJS.ProcessEnv;
  target: string;
  insecure: boolean;
}

export async function runLogin(rest: readonly string[], deps: LoginDeps): Promise<number> {
  const { io, env, target, insecure } = deps;
  const parsed = parseLoginFlags(rest);
  if ('error' in parsed) {
    io.stderr(`${parsed.error}\n`);
    return 1;
  }
  if (parsed.help) {
    io.stdout(USAGE);
    return 0;
  }

  const canPrompt = io.isTTY;
  let mode: 'ssh' | 'password' | 'recovery';
  if (parsed.ssh) mode = 'ssh';
  else if (parsed.password) mode = 'password';
  else if (parsed.recovery) mode = 'recovery';
  else if (canPrompt) {
    const answer = (await io.prompt('sign in with (s)sh, (p)assword or (r)ecovery code? '))
      .trim()
      .toLowerCase();
    mode = answer.startsWith('s') ? 'ssh' : answer.startsWith('r') ? 'recovery' : 'password';
  } else {
    io.stderr('Specify --ssh, --password or --recovery (no terminal to prompt with).\n');
    return 1;
  }

  const api = createApi(target, insecure);
  try {
    const store = await openCredentialStore(io, env, rest);
    const manager = new SessionManager({ api, store, nodeOrigin: target });

    if (mode === 'ssh') {
      const resolved = await resolveSshIdentity(parsed.sshKey, env);
      if ('error' in resolved) {
        io.stderr(`${resolved.error}\n`);
        return 1;
      }
      const response = await performSshLogin({
        api,
        nodeDomain: target,
        identity: resolved.identity,
        publicKeyOpenssh: resolved.publicKeyOpenssh,
        socketPath: resolved.socketPath,
      });
      const session = await manager.applySshLoginResult(response);
      io.stdout(`Signed in as @${session.actor?.handle ?? '?'} on ${target}.\n`);
      return 0;
    }

    const emailOrHandle =
      parsed.emailOrHandle ?? (canPrompt ? await io.prompt('email or handle: ') : undefined);
    if (emailOrHandle === undefined || emailOrHandle === '') {
      io.stderr(
        'An email or handle is required: pass --email-or-handle, or run this interactively.\n',
      );
      return 1;
    }

    if (mode === 'recovery') {
      const code = parsed.passwordStdin
        ? await io.readStdin()
        : (parsed.codeValue ??
          (canPrompt ? await io.promptPassword('recovery code: ') : undefined));
      if (code === undefined || code === '') {
        io.stderr(
          'A recovery code is required: pass --password-stdin, or run this interactively.\n',
        );
        return 1;
      }
      const session = await manager.loginWithRecoveryCode(emailOrHandle, code);
      io.stdout(`Signed in as @${session.actor?.handle ?? emailOrHandle} on ${target}.\n`);
      io.stdout(
        'A security notification was posted to your account — that recovery code can never be used again.\n',
      );
      return 0;
    }

    const password = parsed.passwordStdin
      ? await io.readStdin()
      : (parsed.passwordValue ?? (canPrompt ? await io.promptPassword('password: ') : undefined));
    if (password === undefined || password === '') {
      io.stderr('A password is required: pass --password-stdin, or run this interactively.\n');
      return 1;
    }

    const session = await manager.loginWithPassword(emailOrHandle, password);
    io.stdout(`Signed in as @${session.actor?.handle ?? emailOrHandle} on ${target}.\n`);
    return 0;
  } catch (error) {
    reportAuthError(io, error, target, 'credentials');
    return 1;
  } finally {
    api.close();
  }
}

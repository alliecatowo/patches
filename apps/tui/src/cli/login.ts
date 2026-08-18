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
  emailOrHandle?: string;
  passwordValue?: string;
  passwordStdin: boolean;
  sshKey?: string;
  help: boolean;
}

const USAGE = `Usage: patches login [options]

Signs in with a password or an SSH key (spec §33, §166).

Options:
  --node, --server <host:port>  node to sign in to
  --ssh                          use SSH-key login
  --password                     use password login
  --email-or-handle <value>     handle or recovery email, for --password
  --password-stdin              read the password from stdin instead of prompting
  --ssh-key <path|fingerprint>  which loaded SSH identity to sign with
  -h, --help                     show this message
`;

export function parseLoginFlags(rest: readonly string[]): LoginFlags | { error: string } {
  const flags: LoginFlags = { ssh: false, password: false, passwordStdin: false, help: false };
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
  if (flags.ssh && flags.password) {
    return { error: 'Pass only one of --ssh / --password.' };
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
  let mode: 'ssh' | 'password';
  if (parsed.ssh) mode = 'ssh';
  else if (parsed.password) mode = 'password';
  else if (canPrompt) {
    const answer = (await io.prompt('sign in with (s)sh or (p)assword? ')).trim().toLowerCase();
    mode = answer.startsWith('s') ? 'ssh' : 'password';
  } else {
    io.stderr('Specify --ssh or --password (no terminal to prompt with).\n');
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
    const password = parsed.passwordStdin
      ? await io.readStdin()
      : (parsed.passwordValue ?? (canPrompt ? await io.promptPassword('password: ') : undefined));

    if (emailOrHandle === undefined || emailOrHandle === '') {
      io.stderr(
        'An email or handle is required: pass --email-or-handle, or run this interactively.\n',
      );
      return 1;
    }
    if (password === undefined || password === '') {
      io.stderr('A password is required: pass --password-stdin, or run this interactively.\n');
      return 1;
    }

    const session = await manager.loginWithPassword(emailOrHandle, password);
    io.stdout(`Signed in as @${session.actor?.handle ?? emailOrHandle} on ${target}.\n`);
    return 0;
  } catch (error) {
    reportAuthError(io, error, target);
    return 1;
  } finally {
    api.close();
  }
}

export type Command =
  | 'tui'
  | 'ping'
  | 'version'
  | 'help'
  | 'register'
  | 'login'
  | 'logout'
  | 'accounts'
  | 'whoami'
  | 'keys';

const AUTH_COMMANDS: readonly Command[] = [
  'register',
  'login',
  'logout',
  'accounts',
  'whoami',
  'keys',
];

export interface ParsedArgs {
  command: Command;
  target: string;
  insecure: boolean;
  /**
   * Everything after the command word that isn't a shared connection flag
   * (`--server`/`--node`/`--insecure`) — the auth subcommands (`register`,
   * `login`, `logout`) parse this themselves, since each has its own flag set
   * and cramming all of them into this shared parser would make every
   * subcommand's flags visible (and colliding) with every other's.
   */
  rest: string[];
  /** Populated when the arguments could not be understood. */
  error?: string;
}

export const DEFAULT_TARGET = '127.0.0.1:50051';

export interface ParseEnvironment {
  PATCHES_SERVER?: string | undefined;
  PATCHES_INSECURE?: string | undefined;
}

function isTruthy(value: string | undefined): boolean {
  if (value === undefined) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

/**
 * Minimal hand-rolled argument parsing.
 *
 * Deliberately not a CLI framework: the TUI takes four flags, and a dependency
 * that owns `--help` output would start dictating the product's voice.
 */
export function parseArgs(argv: readonly string[], env: ParseEnvironment = {}): ParsedArgs {
  const result: ParsedArgs = {
    command: 'tui',
    target:
      env.PATCHES_SERVER?.trim() === undefined || env.PATCHES_SERVER.trim() === ''
        ? DEFAULT_TARGET
        : env.PATCHES_SERVER.trim(),
    insecure: isTruthy(env.PATCHES_INSECURE),
    rest: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case '--version':
      case '-v':
        result.command = 'version';
        break;
      case '--help':
      case '-h':
        // An auth subcommand's own --help (e.g. `patches register --help`) is its
        // business, not this parser's — forward it instead of overriding the command.
        if (AUTH_COMMANDS.includes(result.command)) {
          result.rest.push(argument);
        } else {
          result.command = 'help';
        }
        break;
      case 'ping':
      case '--once':
        result.command = 'ping';
        break;
      case 'register':
      case 'login':
      case 'logout':
      case 'accounts':
      case 'whoami':
      case 'keys':
        result.command = argument;
        break;
      case '--insecure':
        result.insecure = true;
        break;
      case '--server':
      case '--node': {
        const value = argv[index + 1];
        if (value === undefined || value.startsWith('-')) {
          return {
            ...result,
            command: 'help',
            error: `${argument} needs an address, e.g. ${argument} 127.0.0.1:50051`,
          };
        }
        result.target = value;
        index += 1;
        break;
      }
      default: {
        if (argument === undefined) break;
        if (argument.startsWith('--server=')) {
          result.target = argument.slice('--server='.length);
          break;
        }
        if (argument.startsWith('--node=')) {
          result.target = argument.slice('--node='.length);
          break;
        }
        if (AUTH_COMMANDS.includes(result.command)) {
          result.rest.push(argument);
          break;
        }
        return { ...result, command: 'help', error: `Unknown argument: ${argument}` };
      }
    }
  }

  return result;
}

export const USAGE = `patches — a terminal-native social network

Usage:
  patches [options]            open the Patches TUI
  patches ping [options]       contact the server once, print JSON, exit
  patches register [options]   create an account on a node
  patches login [options]      sign in with a password or an SSH key
  patches logout [options]     sign out (add --all for every stored account)
  patches accounts             list accounts stored on this machine
  patches whoami                show who you are signed in as
  patches keys <add|list|remove> manage SSH-key credentials on your account
  patches --version            print the client version

Options:
  --server, --node <host:port>   Patches server to talk to (env: PATCHES_SERVER)
  --insecure                     connect without TLS (env: PATCHES_INSECURE)
  -h, --help                     show this message
  -v, --version                  show the client version

Run \`patches register --help\` / \`patches login --help\` / \`patches keys --help\` for
subcommand-specific options.
`;

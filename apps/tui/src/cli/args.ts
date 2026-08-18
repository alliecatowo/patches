export type Command = 'tui' | 'ping' | 'version' | 'help';

export interface ParsedArgs {
  command: Command;
  target: string;
  insecure: boolean;
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
        result.command = 'help';
        break;
      case 'ping':
      case '--once':
        result.command = 'ping';
        break;
      case '--insecure':
        result.insecure = true;
        break;
      case '--server': {
        const value = argv[index + 1];
        if (value === undefined || value.startsWith('-')) {
          return {
            ...result,
            command: 'help',
            error: '--server needs an address, e.g. --server 127.0.0.1:50051',
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
  patches --version            print the client version

Options:
  --server <host:port>   Patches server to talk to (env: PATCHES_SERVER)
  --insecure             connect without TLS (env: PATCHES_INSECURE)
  -h, --help             show this message
  -v, --version          show the client version
`;

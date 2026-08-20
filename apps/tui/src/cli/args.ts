import { isTruthy } from '../env.js';

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
  | 'keys'
  | 'verify'
  | 'approve'
  | 'profile'
  | 'dm'
  | 'community'
  | 'tag'
  | 'upgrade'
  | 'privacy'
  | 'filter'
  | 'lists'
  | 'labelers'
  | 'appeal'
  | 'modlog'
  | 'recovery-codes';

const SUBCOMMANDS: readonly Command[] = [
  'register',
  'login',
  'logout',
  'accounts',
  'whoami',
  'keys',
  'verify',
  'approve',
  'profile',
  'dm',
  'community',
  'tag',
  'privacy',
  'filter',
  'lists',
  'labelers',
  'appeal',
  'modlog',
  'recovery-codes',
];

export interface ParsedArgs {
  command: Command;
  target: string;
  insecure: boolean;
  /** Strips all nameplate decoration app-wide (spec §173's required "plain mode") —
   * `--plain` or `PATCHES_PLAIN=1`. Also toggleable at runtime (`P`, see `App.tsx`). */
  plain: boolean;
  /** P12-118's linear/screen-reader mode — one column, no overlays/drawers, indexed
   * rows, plain mode implied. `--linear` or `PATCHES_LINEAR=1`. Also toggleable at
   * runtime (`:linear`, see `App.tsx`). */
  linear: boolean;
  /** Highest-precedence theme selection (design vision §4.2: `--theme` > `PATCHES_THEME` >
   * profile preference > `patches`). Resolved against the built-in/user-theme registry by
   * `theme/themes/resolution.ts`, not here — this parser only recognizes the flag so it
   * doesn't fall through to "Unknown argument". */
  themeName?: string;
  /** `--no-upgrade-check` — also settable via `PATCHES_NO_UPGRADE_CHECK`/`CI` env vars, which
   * `isUpgradeCheckEnabled` (`upgrade/check.ts`) checks directly rather than through this parser. */
  noUpgradeCheck: boolean;
  /**
   * Everything after the command word that isn't a shared connection flag
   * (`--server`/`--node`/`--insecure`) — the auth subcommands (`register`,
   * `login`, `logout`) parse this themselves, since each has its own flag set
   * and cramming all of them into this shared parser would make every
   * subcommand's flags visible (and colliding) with every other's.
   */
  rest: string[];
  /** Populated by `visit @handle[/slug]` (P45-006) — opens the TUI directly on that
   * actor's Patches Page rather than the usual `connect` screen. */
  visitTarget?: { handle: string; slug: string };
  /** Populated when the arguments could not be understood. */
  error?: string;
}

/**
 * The flagship node (spec §162: Patches is node software; patches.social is the reference
 * node). TLS on 443 — no `--insecure` needed. Local development passes
 * `--server 127.0.0.1:50051 --insecure` (see `mise run tui`).
 */
export const DEFAULT_TARGET = 'patches-social.fly.dev:443';

export interface ParseEnvironment {
  PATCHES_SERVER?: string | undefined;
  PATCHES_INSECURE?: string | undefined;
  PATCHES_PLAIN?: string | undefined;
  PATCHES_LINEAR?: string | undefined;
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
    plain: isTruthy(env.PATCHES_PLAIN),
    linear: isTruthy(env.PATCHES_LINEAR),
    noUpgradeCheck: false,
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
        // A subcommand's own --help (e.g. `patches register --help`) is its
        // business, not this parser's — forward it instead of overriding the command.
        if (SUBCOMMANDS.includes(result.command)) {
          result.rest.push(argument);
        } else {
          result.command = 'help';
        }
        break;
      case 'ping':
      case '--once':
        result.command = 'ping';
        break;
      case 'visit': {
        const target = argv[index + 1];
        const handle = target?.startsWith('@') ? target.slice(1) : undefined;
        if (handle === undefined || handle === '') {
          return {
            ...result,
            command: 'help',
            error:
              'visit needs a target, e.g. patches visit @handle or patches visit @handle/about',
          };
        }
        const [rawHandle, slug = ''] = handle.split('/');
        result.visitTarget = { handle: rawHandle ?? '', slug };
        index += 1;
        break;
      }
      case 'register':
      case 'login':
      case 'logout':
      case 'accounts':
      case 'whoami':
      case 'keys':
      case 'verify':
      case 'approve':
      case 'profile':
      case 'dm':
      case 'community':
      case 'tag':
      case 'upgrade':
      case 'privacy':
      case 'filter':
      case 'lists':
      case 'labelers':
      case 'appeal':
      case 'modlog':
      case 'recovery-codes':
        result.command = argument;
        break;
      case '--insecure':
        result.insecure = true;
        break;
      case '--plain':
        result.plain = true;
        break;
      case '--linear':
        result.linear = true;
        break;
      case '--no-upgrade-check':
        result.noUpgradeCheck = true;
        break;
      case '--theme': {
        const value = argv[index + 1];
        if (value === undefined || value.startsWith('-')) {
          return { ...result, command: 'help', error: '--theme needs a name, e.g. --theme paper' };
        }
        result.themeName = value;
        index += 1;
        break;
      }
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
        if (argument.startsWith('--theme=')) {
          result.themeName = argument.slice('--theme='.length);
          break;
        }
        if (SUBCOMMANDS.includes(result.command)) {
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
  patches visit @handle[/slug] open straight to that actor's Patches Page
  patches register [options]   create an account on a node
  patches login [options]      sign in with a password or an SSH key
  patches logout [options]     sign out (add --all for every stored account)
  patches accounts             list accounts stored on this machine
  patches whoami                show who you are signed in as
  patches keys <add|list|remove> manage SSH-key credentials on your account
  patches verify <code>        confirm your email with the code it was sent
  patches verify --resend      ask the server to resend the verification email
  patches approve <code>       approve a "sign in from your browser" device link
  patches profile edit [opts]  edit your display name/bio/location/website
  patches dm <command>         list, read, send, or manage message requests
  patches community <command>  list, join, leave, or post to communities
  patches tag <command>        search or read/mute a tag
  patches upgrade               check for and install a newer release, then exit
  patches privacy <command>    privacy notice, discoverability, export, deletion
  patches filter <command>     manage your own bring-your-own-filter rules
  patches lists <command>      browse, subscribe to, and publish filter lists
  patches labelers <command>   subscribe to labelers and set per-value actions
  patches appeal <command>     file and track appeals against a moderation notice
  patches modlog                this node's public, anonymized moderation log
  patches --version            print the client version

Options:
  --server, --node <host:port>   Patches server to talk to (env: PATCHES_SERVER)
  --insecure                     connect without TLS (env: PATCHES_INSECURE)
  --plain                        strip nameplate decoration (env: PATCHES_PLAIN;
                                  also toggleable at runtime with P)
  --linear                       linear/screen-reader mode: one column, no overlays or
                                  drawers, indexed rows, plain implied (env: PATCHES_LINEAR;
                                  also toggleable at runtime with :linear)
  --theme <name>                 select a theme (env: PATCHES_THEME; patches, paper, mono,
                                  hacker, pastel, terminal, or a name from
                                  $XDG_CONFIG_HOME/patches/themes/)
  --no-upgrade-check             skip the launch-time check for a newer release
                                  (env: PATCHES_NO_UPGRADE_CHECK; also skipped under CI=true)
  -h, --help                     show this message
  -v, --version                  show the client version

Run \`patches register --help\` / \`patches login --help\` / \`patches keys --help\` /
\`patches profile edit --help\` / \`patches dm --help\` / \`patches community --help\` /
\`patches tag --help\` / \`patches privacy --help\` / \`patches filter --help\` /
\`patches lists --help\` / \`patches labelers --help\` / \`patches appeal --help\` /
\`patches modlog --help\` for subcommand-specific options.
`;

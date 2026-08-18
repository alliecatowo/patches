#!/usr/bin/env node
import { render } from 'ink';

import { PatchesApi } from './api/client.js';
import { runAccounts } from './cli/accounts.js';
import { parseArgs, USAGE } from './cli/args.js';
import { openCredentialStore } from './cli/auth-shared.js';
import { createNodeIo } from './cli/io.js';
import { runKeys } from './cli/keys.js';
import { runLogin } from './cli/login.js';
import { runLogout } from './cli/logout.js';
import { runPing } from './cli/ping.js';
import { runRegister } from './cli/register.js';
import { runWhoami } from './cli/whoami.js';
import { App } from './app/App.js';
import { installTerminalCleanup } from './terminal/cleanup.js';
import { TUI_VERSION } from './version.js';

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2), process.env);

  if (args.command === 'version') {
    process.stdout.write(`${TUI_VERSION}\n`);
    return 0;
  }

  if (args.command === 'help') {
    if (args.error !== undefined) {
      process.stderr.write(`${args.error}\n\n`);
      process.stderr.write(USAGE);
      return 1;
    }
    process.stdout.write(USAGE);
    return 0;
  }

  if (args.command === 'ping') {
    const { json, exitCode } = await runPing(args);
    process.stdout.write(json);
    return exitCode;
  }

  const io = createNodeIo();
  const { target, insecure, rest } = args;

  if (args.command === 'register')
    return runRegister(rest, { io, env: process.env, target, insecure });
  if (args.command === 'login') return runLogin(rest, { io, env: process.env, target, insecure });
  if (args.command === 'logout') return runLogout(rest, { io, env: process.env, target, insecure });
  if (args.command === 'accounts') return runAccounts(rest, { io, env: process.env });
  if (args.command === 'whoami') return runWhoami(rest, { io, env: process.env, target, insecure });
  if (args.command === 'keys') return runKeys(rest, { io, env: process.env, target, insecure });

  return runTui(args);
}

async function runTui(args: { target: string; insecure: boolean }): Promise<number> {
  if (!process.stdout.isTTY) {
    // Without a TTY there is no alternate screen and no way to press `q`, so the
    // app would render once and then hang. Say so, and point at the command that
    // does work in a pipe.
    process.stderr.write('patches: this needs an interactive terminal.\n');
    process.stderr.write(`Try: patches ping --server ${args.target}\n`);
    return 1;
  }

  const restoreTerminal = installTerminalCleanup();
  const api = new PatchesApi(args);
  // Opened before `render()` — its one-time "no keyring available" warning (if any)
  // goes to a normal stderr, not the alternate screen (spec §37).
  const credentialStore = await openCredentialStore(createNodeIo(), process.env);

  try {
    const instance = render(<App api={api} credentialStore={credentialStore} />, {
      // Ink 7 owns the alternate screen and restores the original buffer on exit;
      // hand-rolling \x1b[?1049h is unnecessary and racy.
      alternateScreen: true,
      exitOnCtrlC: true,
    });
    await instance.waitUntilExit();
    return 0;
  } finally {
    api.close();
    restoreTerminal();
  }
}

main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error: unknown) => {
    // Last line of defence: a user must never see a Node stack trace (spec §81).
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`patches: ${message}\n`);
    process.exitCode = 1;
  });

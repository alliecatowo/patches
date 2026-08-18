#!/usr/bin/env node
import { render } from 'ink';

import { PatchesApi } from './api/client.js';
import { parseArgs, USAGE } from './cli/args.js';
import { runPing } from './cli/ping.js';
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

  try {
    const instance = render(<App api={api} />, {
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

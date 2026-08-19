#!/usr/bin/env node
import { render } from 'ink';
import {
  createRenderer,
  detectTerminalGraphics,
  installMediaCleanup,
  MediaRendererProvider,
} from '@patches/terminal-media';

import { PatchesApi } from './api/client.js';
import { runAccounts } from './cli/accounts.js';
import { parseArgs, USAGE } from './cli/args.js';
import { openCredentialStore } from './cli/auth-shared.js';
import { runCommunity } from './cli/community.js';
import { runDm } from './cli/dm.js';
import { createNodeIo } from './cli/io.js';
import { runKeys } from './cli/keys.js';
import { runLogin } from './cli/login.js';
import { runLogout } from './cli/logout.js';
import { runPing } from './cli/ping.js';
import { runProfile } from './cli/profile.js';
import { runRegister } from './cli/register.js';
import { runTag } from './cli/tag.js';
import { runVerify } from './cli/verify.js';
import { runWhoami } from './cli/whoami.js';
import { isTruthy } from './env.js';
import { App } from './app/App.js';
import { installTerminalCleanup } from './terminal/cleanup.js';
import { checkForUpgrade, createFileUpgradeCache, isUpgradeCheckEnabled } from './upgrade/check.js';
import { installUpgrade } from './upgrade/install.js';
import { UpgradePrompt } from './upgrade/UpgradePrompt.js';
import { TUI_VERSION } from './version.js';

/** Debug logging for the upgrade check only — never printed in normal mode (harness brief:
 * "never print errors in normal mode; --verbose/PATCHES_DEBUG may log"). */
function debugUpgradeLog(message: string): void {
  if (isTruthy(process.env.PATCHES_DEBUG)) {
    process.stderr.write(`patches: upgrade check: ${message}\n`);
  }
}

/** After `detectTerminalGraphics()` resolves, give the (already-started) upgrade check a small
 * extra cap rather than the network request's own multi-second timeout — launch must not get
 * noticeably slower just because GitHub is slow to answer. 800ms is enough for a normal GitHub
 * API round trip (the graphics probe alone rarely covers that) while staying well under a
 * human's "did this just hang" threshold; a genuinely slow/offline network still just skips the
 * prompt for this one launch — the cache makes every launch inside the next 6h resolve instantly. */
const UPGRADE_CHECK_RENDER_CAP_MS = 800;

function raceWithCap<T>(promise: Promise<T>, capMs: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), capMs);
    }),
  ]);
}

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

  if (args.command === 'upgrade') {
    return runUpgradeCommand();
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
  if (args.command === 'verify') return runVerify(rest, { io, env: process.env, target, insecure });
  if (args.command === 'profile')
    return runProfile(rest, { io, env: process.env, target, insecure });
  if (args.command === 'dm') return runDm(rest, { io, env: process.env, target, insecure });
  if (args.command === 'community')
    return runCommunity(rest, { io, env: process.env, target, insecure });
  if (args.command === 'tag') return runTag(rest, { io, env: process.env, target, insecure });

  return runTui(args);
}

async function runTui(args: {
  target: string;
  insecure: boolean;
  plain: boolean;
  noUpgradeCheck: boolean;
  visitTarget?: { handle: string; slug: string };
}): Promise<number> {
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
  // `--plain` normalized into the env `App` already reads (`PATCHES_PLAIN`) rather than
  // a separate prop — one source of truth for "is plain mode on at startup" (spec §173).
  const env = args.plain ? { ...process.env, PATCHES_PLAIN: '1' } : process.env;

  // Started here, not awaited yet, so the network round trip overlaps
  // `detectTerminalGraphics()`'s own wait instead of adding to launch time.
  const upgradeCheckPromise = isUpgradeCheckEnabled(process.env, args.noUpgradeCheck)
    ? checkForUpgrade({
        currentVersion: TUI_VERSION,
        fetch: globalThis.fetch,
        cache: createFileUpgradeCache(),
        onDebug: debugUpgradeLog,
      })
    : Promise.resolve(undefined);

  // MUST run before `render()` — Ink puts stdin in raw mode and consumes `data`, and a
  // probe started afterwards races Ink's key parser (@patches/terminal-media's README,
  // spec §74's "probe before render").
  const graphicsCapabilities = await detectTerminalGraphics();

  // Give the (already-running) upgrade check a small extra cap rather than the multi-second
  // network timeout it owns internally — a slow GitHub response must never noticeably delay
  // opening the TUI (harness brief).
  const upgrade = await raceWithCap(upgradeCheckPromise, UPGRADE_CHECK_RENDER_CAP_MS, undefined);
  if (upgrade !== undefined) {
    await promptForUpgrade({ currentVersion: TUI_VERSION, upgrade, plain: args.plain });
  }

  const mediaRenderer = createRenderer(graphicsCapabilities);
  // Freed on exit/signal even though Ink's own alternate-screen teardown runs first —
  // Ink treats teardown-time writes as disposable, so the actual `d=I` deletes have to
  // reach stdout from an `exit`/signal handler, not a React effect (spec §70).
  const uninstallMediaCleanup = installMediaCleanup(mediaRenderer);

  try {
    const instance = render(
      <MediaRendererProvider renderer={mediaRenderer}>
        <App
          api={api}
          credentialStore={credentialStore}
          env={env}
          initialPageTarget={args.visitTarget}
        />
      </MediaRendererProvider>,
      {
        // Ink 7 owns the alternate screen and restores the original buffer on exit;
        // hand-rolling \x1b[?1049h is unnecessary and racy.
        alternateScreen: true,
        exitOnCtrlC: true,
      },
    );
    await instance.waitUntilExit();
    return 0;
  } finally {
    api.close();
    uninstallMediaCleanup();
    mediaRenderer.releaseAll();
    restoreTerminal();
  }
}

/**
 * Renders `UpgradePrompt` in its own `render()` call — deliberately not on the alternate
 * screen, so the prompt (and any decline) stays in scrollback either way — and resolves once
 * the user declines or dismisses a failure. A successful upgrade never resolves this promise:
 * the component stays on screen showing "press Ctrl+C to exit", and `exitOnCtrlC: true` on
 * this render instance is what actually lets Ctrl+C end the process from there.
 */
function promptForUpgrade(props: {
  currentVersion: string;
  upgrade: Parameters<typeof UpgradePrompt>[0]['upgrade'];
  plain: boolean;
}): Promise<void> {
  return new Promise((resolve) => {
    const instance = render(
      <UpgradePrompt
        currentVersion={props.currentVersion}
        upgrade={props.upgrade}
        plain={props.plain}
        install={(upgrade, onOutput) => installUpgrade(upgrade, { onOutput })}
        onDone={() => {
          instance.unmount();
          resolve();
        }}
      />,
      { exitOnCtrlC: true },
    );
  });
}

/** `patches upgrade` — forces a fresh (cache-bypassing) check and installs synchronously,
 * printing to stdout/stderr and returning a process exit code, no Ink involved. */
async function runUpgradeCommand(): Promise<number> {
  let checkFailed = false;
  const upgrade = await checkForUpgrade({
    currentVersion: TUI_VERSION,
    fetch: globalThis.fetch,
    cache: createFileUpgradeCache(),
    force: true,
    onDebug: () => {
      checkFailed = true;
    },
  });

  if (upgrade === undefined) {
    if (checkFailed) {
      process.stderr.write('patches: could not reach GitHub to check for an upgrade.\n');
      return 1;
    }
    process.stdout.write(`patches: already up to date (${TUI_VERSION}).\n`);
    return 0;
  }

  process.stdout.write(`Upgrading ${TUI_VERSION} -> ${upgrade.latestVersion}...\n`);
  const result = await installUpgrade(upgrade, {
    onOutput: (line) => process.stdout.write(`${line}\n`),
  });

  if (result.ok) {
    process.stdout.write(`Upgraded to ${upgrade.latestVersion}. Relaunch \`patches\` to use it.\n`);
    return 0;
  }

  process.stderr.write(`patches: upgrade failed: ${result.message}\n`);
  if (result.manualCommand !== undefined) {
    process.stderr.write(`Try it by hand: ${result.manualCommand}\n`);
  }
  return 1;
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

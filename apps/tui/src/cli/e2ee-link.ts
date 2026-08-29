/**
 * `patches e2ee link` / `patches e2ee approve-link` / `patches e2ee rotate-root` (ADR 0037
 * §1–§2, issues #265/#266) — the headless terminal surface for device linking and root
 * rotation, required by §3's "TUI always has a non-Kitty, non-interactive fallback": no
 * QR, digits only, works over plain stdout.
 *
 * Every command here is a thin CLI wrapper (session/vault/transport wiring, prompts,
 * output) around the pure orchestration functions below, which take an already-open
 * vault and an `EnrollmentTransport` — exactly the shape `apps/tui/src/e2ee/test-support.ts`'s
 * `fakeTransport`/`memoryVault` provide, so the flows are unit-tested without a real node.
 */
import { DeviceLinkError, type PendingLinkOfferSummary } from '../e2ee/device-link.js';
import {
  approveLinkOffer,
  beginDeviceLinkOffer,
  listLinkOffers,
  pollLinkedEnrollment,
  rotateMessagingRoot,
} from '../e2ee/device-link.js';
import { NEEDS_AUTHORITY_COPY, type EnrollmentTransport } from '../e2ee/enrollment.js';
import { createRatchetSessionVault, type RatchetSessionVault } from '../e2ee/ratchet-vault.js';
import type { VaultAccount } from '../e2ee/vault-key-providers.js';
import { createEnrollmentTransport } from '../app/e2ee-transports.js';
import { SessionManager } from '../auth/session.js';
import {
  createApi,
  isAllowInsecureCredentialFile,
  openCredentialStore,
  reportAuthError,
} from './auth-shared.js';
import type { CliIo } from './io.js';

/** ADR 0037 §1 step 2: shown verbatim when the SAS the two devices display disagrees. */
export const LINK_MISMATCH_COPY =
  'The node showed this device different keys. Nothing was approved.';

const LINK_USAGE = `Usage: patches e2ee link

Starts a device-link offer for THIS machine and prints a five-group short
authentication string (SAS). Compare it against the same code on a device that
already holds this account's messaging identity, then approve it there. Polls
until the other device approves, the offer expires (10 minutes), or Ctrl-C.
`;

const APPROVE_LINK_USAGE = `Usage: patches e2ee approve-link [<link-id>]

Lists this account's pending device-link requests (or just one, if a link id is
given), shows each one's SAS, and asks whether it matches the code shown on the
requesting device before approving it. Only this account's authority device
(the one holding the messaging-root key) can run this.
`;

const ROTATE_ROOT_USAGE = `Usage: patches e2ee rotate-root

Starts a brand-new messaging identity generation for this account. Every
contact you message will see a hard identity-change warning, and message
history on any device that is not this one is not recoverable — this is the
recovery path for "no device holds the account's messaging identity anymore",
not something to run casually.
`;

export interface E2eeLinkDeps {
  readonly io: CliIo;
  readonly env: NodeJS.ProcessEnv;
  readonly target: string;
  readonly insecure: boolean;
}

// ---------------------------------------------------------------------------
// Pure flows — testable against `fakeTransport`/`memoryVault` (test-support.ts)
// ---------------------------------------------------------------------------

export interface LinkFlowOptions {
  /** Injectable for tests; defaults to 3000ms (ADR 0037 §1). */
  readonly pollIntervalMs?: number;
  /** Injectable for tests; defaults to a real `setTimeout`-based sleep. */
  readonly sleep?: (ms: number) => Promise<void>;
  /** Bounds the poll loop so tests terminate; defaults to unbounded (Ctrl-C exits the
   * real process, which needs no code here — Node's default SIGINT handling applies). */
  readonly maxPolls?: number;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

/** ADR 0037 §1 steps 1 + 4: posts this device's link offer, prints its SAS, and polls
 * until the authority approves it, the offer expires, or the poll budget runs out. */
export async function runLinkOfferFlow(
  io: CliIo,
  transport: EnrollmentTransport,
  vault: RatchetSessionVault,
  actorId: string,
  nowMs: () => number,
  options: LinkFlowOptions = {},
): Promise<number> {
  const offer = await beginDeviceLinkOffer({ actorId, transport, vault, nowMs });
  io.stdout(
    `Compare this code on a device that already has your messaging identity:\n\n  ${offer.sas}\n\n` +
      'Approve it there. Waiting for approval...\n',
  );
  const sleep = options.sleep ?? defaultSleep;
  const pollIntervalMs = options.pollIntervalMs ?? 3_000;
  const maxPolls = options.maxPolls ?? Number.POSITIVE_INFINITY;
  for (let poll = 0; poll < maxPolls; poll += 1) {
    await sleep(pollIntervalMs);
    const result = await pollLinkedEnrollment({ actorId, transport, vault, nowMs });
    if (result === 'enrolled') {
      io.stdout('This device is now linked and enrolled for encrypted messages.\n');
      return 0;
    }
    if (result === 'expired') {
      io.stderr('That link request expired before it was approved.\n');
      return 1;
    }
  }
  io.stderr('Timed out waiting for approval.\n');
  return 1;
}

/** ADR 0037 §1 steps 2–3: lists (optionally one) pending link offers, asks the operator
 * to confirm each SAS, and approves a match or discards a mismatch — never retries a
 * mismatch silently. */
export async function runApproveLinkFlow(
  io: CliIo,
  transport: EnrollmentTransport,
  vault: RatchetSessionVault,
  actorId: string,
  nowMs: () => number,
  linkId: string | undefined,
  confirmMatch: (offer: PendingLinkOfferSummary) => Promise<boolean>,
): Promise<number> {
  let offers: readonly PendingLinkOfferSummary[];
  try {
    offers = await listLinkOffers({ actorId, transport, vault, nowMs: nowMs });
  } catch (error) {
    io.stderr(
      `${error instanceof DeviceLinkError ? error.message : 'Could not list device links.'}\n`,
    );
    return 1;
  }
  const targets = linkId === undefined ? offers : offers.filter((offer) => offer.linkId === linkId);
  if (targets.length === 0) {
    if (linkId === undefined) {
      io.stdout('No pending link requests.\n');
      return 0;
    }
    io.stderr('That device-link request is no longer available.\n');
    return 1;
  }

  let failed = false;
  for (const offer of targets) {
    io.stdout(`\nDevice ${offer.deviceId}\nCode: ${offer.sas}\n`);
    const matches = await confirmMatch(offer);
    if (!matches) {
      await transport.cancelDeviceLink(offer.linkId);
      io.stdout(`${LINK_MISMATCH_COPY}\n`);
      continue;
    }
    try {
      await approveLinkOffer({ actorId, linkId: offer.linkId, transport, vault, nowMs });
      io.stdout(`Linked device ${offer.deviceId}.\n`);
    } catch (error) {
      failed = true;
      io.stderr(`${error instanceof Error ? error.message : 'Could not approve that link.'}\n`);
    }
  }
  return failed ? 1 : 0;
}

/** ADR 0037 §2: mints and publishes the next root generation after an explicit confirm —
 * `confirm` owns showing `NEEDS_AUTHORITY_COPY.rotate` and reading the answer. */
export async function runRotateRootFlow(
  io: CliIo,
  transport: EnrollmentTransport,
  vault: RatchetSessionVault,
  actorId: string,
  nowMs: () => number,
  confirmed: boolean,
): Promise<number> {
  if (!confirmed) {
    io.stdout('Cancelled. No identity was changed.\n');
    return 0;
  }
  try {
    const result = await rotateMessagingRoot({ actorId, transport, vault, nowMs });
    io.stdout(`Started messaging identity generation ${String(result.generation)}.\n`);
    return 0;
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : 'Could not start a new identity.'}\n`);
    return 1;
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function withVaultAndTransport<T>(
  deps: E2eeLinkDeps,
  rest: readonly string[],
  run: (args: {
    transport: EnrollmentTransport;
    vault: RatchetSessionVault;
    actorId: string;
  }) => Promise<T>,
): Promise<T | 1> {
  const { io, env, target, insecure } = deps;
  const api = createApi(target, insecure);
  try {
    const store = await openCredentialStore(io, env, rest);
    const manager = new SessionManager({ api, store, nodeOrigin: target });
    const session = await manager.restore();
    if (session === undefined) {
      io.stderr(`Not signed in on ${target}. Run \`patches login\`.\n`);
      return 1;
    }
    const actorId = session.actor?.id ?? session.userId;
    const account: VaultAccount = { nodeOrigin: target, userId: session.userId };
    const vault = await createRatchetSessionVault({
      account,
      allowInsecureKeyFile: isAllowInsecureCredentialFile(rest, env),
    });
    try {
      await vault.open();
      const transport = createEnrollmentTransport({
        api,
        accessToken: () => manager.ensureAccessToken(),
      });
      return await run({ transport, vault, actorId });
    } finally {
      vault.close();
    }
  } catch (error) {
    reportAuthError(io, error, target);
    return 1;
  } finally {
    api.close();
  }
}

export async function runE2eeLink(rest: readonly string[], deps: E2eeLinkDeps): Promise<number> {
  if (rest.includes('-h') || rest.includes('--help')) {
    deps.io.stdout(LINK_USAGE);
    return 0;
  }
  return withVaultAndTransport(deps, rest, ({ transport, vault, actorId }) =>
    runLinkOfferFlow(deps.io, transport, vault, actorId, Date.now),
  );
}

export async function runE2eeApproveLink(
  rest: readonly string[],
  deps: E2eeLinkDeps,
): Promise<number> {
  if (rest.includes('-h') || rest.includes('--help')) {
    deps.io.stdout(APPROVE_LINK_USAGE);
    return 0;
  }
  const [linkId] = rest.filter((argument) => !argument.startsWith('-'));
  return withVaultAndTransport(deps, rest, ({ transport, vault, actorId }) =>
    runApproveLinkFlow(deps.io, transport, vault, actorId, Date.now, linkId, async (offer) => {
      if (!deps.io.isTTY) {
        deps.io.stderr(
          `Cannot confirm device ${offer.deviceId}'s code without a terminal — run this ` +
            'interactively.\n',
        );
        return false;
      }
      const answer = await deps.io.prompt('Does the code on the other device match? [y/N] ');
      return answer.trim().toLowerCase() === 'y';
    }),
  );
}

export async function runE2eeRotateRoot(
  rest: readonly string[],
  deps: E2eeLinkDeps,
): Promise<number> {
  if (rest.includes('-h') || rest.includes('--help')) {
    deps.io.stdout(ROTATE_ROOT_USAGE);
    return 0;
  }
  return withVaultAndTransport(deps, rest, async ({ transport, vault, actorId }) => {
    if (!deps.io.isTTY) {
      deps.io.stderr('Rotating the messaging identity needs interactive confirmation.\n');
      return 1;
    }
    deps.io.stdout(`${NEEDS_AUTHORITY_COPY.rotate}\n`);
    const answer = await deps.io.prompt('Start a new messaging identity? [y/N] ');
    return runRotateRootFlow(
      deps.io,
      transport,
      vault,
      actorId,
      Date.now,
      answer.trim().toLowerCase() === 'y',
    );
  });
}

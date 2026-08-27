/**
 * `patches e2ee export-recovery` / `patches e2ee import-recovery` (issue #272, ADR 0020
 * §10, ADR 0037 §2) — the only user-reachable surface for the optional recovery archive.
 *
 * Export seals this device's messaging-root private key and current verified roster
 * under a freshly generated recovery key, shown exactly once as a checksummed recovery
 * code. Import decodes that code, opens the archive, and turns the restore plan into a
 * fresh, unsubmitted enrollment record — a brand-new device certificate and prekeys
 * seeded only by the archived root, never a resurrection of old device or session state
 * (ADR 0020 §10's "restore is a fresh enrollment, never a resurrection"). The actual
 * `EnrollDevice` submission happens the next time this device runs the ordinary
 * enrollment flow (`enrollThisDevice`'s resume path), not here.
 */
import { chmod, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { verifyMessagingRoot, zeroize } from '@patches/crypto';
import {
  decodeRecoveryCode,
  E2eeContractError,
  encodeRecoveryCode,
  groupRecoveryCodeForDisplay,
  type E2eeRecoveryArchiveDocument,
  type E2eeRecoveryRestorePlan,
} from '@patches/domain';

import {
  disposeStoredEnrollment,
  generateEnrollment,
  loadStoredEnrollment,
  saveStoredEnrollment,
  type StoredEnrollment,
} from '../e2ee/enrollment.js';
import {
  buildRestorePlan,
  generateRecoveryKey,
  openRecoveryArchive,
  RecoveryArchiveError,
  sealRecoveryArchive,
  zeroizeRestorePlan,
} from '../e2ee/recovery-archive.js';
import { createRatchetSessionVault } from '../e2ee/ratchet-vault.js';
import type { VaultAccount } from '../e2ee/vault-key-providers.js';
import { SessionManager } from '../auth/session.js';
import {
  createApi,
  isAllowInsecureCredentialFile,
  openCredentialStore,
  reportAuthError,
} from './auth-shared.js';
import type { CliIo } from './io.js';

/** The fixed copy ADR 0020 §10 requires wherever a recovery code is shown. */
export const RECOVERY_CODE_WARNING_COPY =
  'Write this down. Without it and without an enrolled device, your encrypted history ' +
  'cannot be recovered. Patches cannot reset it.';

/** Refusal copy for a restore whose archived root has already rotated (generation > 1) —
 * `generateEnrollment`'s resume path only mints a fresh generation-1 root-signed device,
 * so a rotated identity needs the linked-device flow (#265) instead of this CLI. */
export const ROTATED_ROOT_RESTORE_REFUSAL_COPY =
  'This recovery archive holds a messaging identity that has since rotated (generation > 1), ' +
  'which this version cannot restore — enroll from a device that already links the current ' +
  'identity instead.';

const DEFAULT_EXPORT_FILENAME = 'patches-recovery-archive.pvearc';

const EXPORT_USAGE = `Usage: patches e2ee export-recovery [--out <path>]

Seals this device's messaging-root key and current device roster into a recovery
archive (ADR 0020 §10), under a freshly generated recovery key printed exactly once.
Store the archive file and the code somewhere safe and separate from each other.

Options:
  --out <path>   where to write the archive (default: ./${DEFAULT_EXPORT_FILENAME})
  -h, --help     show this message
`;

const IMPORT_USAGE = `Usage: patches e2ee import-recovery <path>

Opens a recovery archive written by \`patches e2ee export-recovery\` and prepares this
device to become a messaging authority again. Prompts for the recovery code (not
echoed). This does not finish enrollment by itself — open the TUI's Accounts → Devices
screen afterward and enroll this device.
`;

export interface E2eeRecoveryDeps {
  readonly io: CliIo;
  readonly env: NodeJS.ProcessEnv;
  readonly target: string;
  readonly insecure: boolean;
}

// ---------------------------------------------------------------------------
// Pure helpers — exported for direct testing without a network/vault double
// ---------------------------------------------------------------------------

/** Builds the archive document from a submitted enrollment: the root keypair and the
 * exact, already-verified roster this device holds. Never conversations, history, or
 * settings — #272's scope is root + roster only. */
export function buildExportDocument(
  actorId: string,
  enrollment: StoredEnrollment,
  nowMs: number,
): E2eeRecoveryArchiveDocument {
  const root = enrollment.identity.ownRoster.root;
  if (enrollment.rootPrivate === undefined) {
    // A linked device (ADR 0037 §1) never holds the root; only an authority device can export.
    throw new RecoveryArchiveError('This device does not hold the messaging identity root.');
  }
  return {
    actorId,
    rootGeneration: root.generation,
    rootPrivateKey: enrollment.rootPrivate,
    rootPublicKey: enrollment.rootPublic,
    rootBytes: root.rootBytes,
    rootSelfSignature: root.selfSignature,
    rosterBytes: enrollment.identity.ownRoster.rosterBytes,
    rosterSignature: enrollment.identity.ownRoster.rootSignature,
    rosterSequence: BigInt(enrollment.identity.ownRoster.sequence),
    rosterDigest: enrollment.identity.ownRoster.rosterDigest,
    createdAtMs: nowMs,
    conversations: [],
    history: [],
    settings: undefined,
  };
}

/**
 * Turns a validated restore plan into a fresh, unsubmitted `StoredEnrollment`: a brand
 * new device signing/agreement keypair, certificate, and prekeys, certified by the
 * archive's root key — the ONLY material this pulls from the archive. No ratchet state,
 * skipped key, prekey, or old device key from anywhere ever reaches the returned record
 * (`generateEnrollment` mints all of that fresh; see its own contract).
 */
export function buildRestoredEnrollmentRecord(
  plan: E2eeRecoveryRestorePlan,
  nowMs: number,
): StoredEnrollment {
  const verifiedRoot = verifyMessagingRoot({
    rootBytes: plan.rootBytes,
    selfSignature: plan.rootSelfSignature,
    nowMs,
  });
  if (verifiedRoot.generation !== 1) {
    throw new RecoveryArchiveError(ROTATED_ROOT_RESTORE_REFUSAL_COPY);
  }
  const generated = generateEnrollment({
    actorId: plan.actorId,
    root: {
      privateKey: plan.rootPrivateKey,
      publicKey: plan.rootPublicKey,
      createdAtMs: verifiedRoot.createdAtMs,
    },
    nowMs,
  });
  return generated.record;
}

export function parseExportRecoveryFlags(
  rest: readonly string[],
): { readonly out?: string; readonly help: boolean } | { readonly error: string } {
  if (rest.includes('-h') || rest.includes('--help')) return { help: true };
  let out: string | undefined;
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === '--out') {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith('-')) {
        return { error: '--out needs a path.' };
      }
      out = value;
      index += 1;
    } else if (argument?.startsWith('--out=') === true) {
      out = argument.slice('--out='.length);
    } else {
      return { error: `Unknown option for export-recovery: ${argument ?? ''}` };
    }
  }
  return { help: false, ...(out === undefined ? {} : { out }) };
}

export function parseImportRecoveryFlags(
  rest: readonly string[],
): { readonly path: string; readonly help: boolean } | { readonly error: string } {
  if (rest.includes('-h') || rest.includes('--help')) return { path: '', help: true };
  const [path] = rest;
  if (path === undefined || path.startsWith('-')) {
    return { error: 'A recovery archive path is required: patches e2ee import-recovery <path>' };
  }
  return { path, help: false };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export async function runE2eeExportRecovery(
  rest: readonly string[],
  deps: E2eeRecoveryDeps,
): Promise<number> {
  const { io, env, target, insecure } = deps;
  const parsed = parseExportRecoveryFlags(rest);
  if ('error' in parsed) {
    io.stderr(`${parsed.error}\n`);
    return 1;
  }
  if (parsed.help) {
    io.stdout(EXPORT_USAGE);
    return 0;
  }

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
      const nowMs = Date.now();
      const enrollment = await loadStoredEnrollment(vault, nowMs);
      if (enrollment === undefined || !enrollment.submitted) {
        io.stderr('This device has no enrolled encrypted-messaging identity to export yet.\n');
        return 1;
      }
      const document = buildExportDocument(actorId, enrollment, nowMs);
      const recoveryKey = generateRecoveryKey();
      const outPath = resolve(parsed.out ?? DEFAULT_EXPORT_FILENAME);
      try {
        const { archive } = sealRecoveryArchive(document, recoveryKey);
        await writeFile(outPath, archive, { mode: 0o600 });
        await chmod(outPath, 0o600);
        const code = groupRecoveryCodeForDisplay(encodeRecoveryCode(recoveryKey));
        io.stdout(`Recovery archive written to ${outPath}\n\n`);
        io.stdout(`Your recovery code (shown once — write it down now):\n\n  ${code}\n\n`);
        io.stdout(`${RECOVERY_CODE_WARNING_COPY}\n`);
      } finally {
        zeroize(recoveryKey);
      }
      disposeStoredEnrollment(enrollment);
      return 0;
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

export async function runE2eeImportRecovery(
  rest: readonly string[],
  deps: E2eeRecoveryDeps,
): Promise<number> {
  const { io, env, target, insecure } = deps;
  const parsed = parseImportRecoveryFlags(rest);
  if ('error' in parsed) {
    io.stderr(`${parsed.error}\n`);
    return 1;
  }
  if (parsed.help) {
    io.stdout(IMPORT_USAGE);
    return 0;
  }

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

    let archiveBytes: Uint8Array;
    try {
      archiveBytes = await readFile(resolve(parsed.path));
    } catch {
      io.stderr(`Could not read ${parsed.path}.\n`);
      return 1;
    }

    if (!io.isTTY) {
      io.stderr('A recovery code must be entered interactively (no terminal to prompt with).\n');
      return 1;
    }
    const code = await io.promptPassword('recovery code: ');
    let recoveryKey: Uint8Array;
    try {
      recoveryKey = decodeRecoveryCode(code);
    } catch (error) {
      io.stderr(
        `${error instanceof E2eeContractError ? error.message : 'That is not a recovery code.'}\n`,
      );
      return 1;
    }

    let view: ReturnType<typeof openRecoveryArchive>;
    try {
      view = openRecoveryArchive(archiveBytes, recoveryKey);
    } catch {
      io.stderr('The recovery archive could not be opened. Check the file and the code.\n');
      return 1;
    } finally {
      zeroize(recoveryKey);
    }

    if (view.actorId !== actorId) {
      io.stderr(
        'This recovery archive belongs to a different account than the one signed in here.\n',
      );
      return 1;
    }

    const accessToken = await manager.ensureAccessToken();
    const rosterResponse = await api.getDeviceRoster({ actorId }, accessToken);
    const served =
      rosterResponse.roster === undefined
        ? { sequence: 0n, digest: new Uint8Array(32) }
        : { sequence: rosterResponse.roster.sequence, digest: rosterResponse.roster.digest };

    let plan: E2eeRecoveryRestorePlan;
    try {
      plan = buildRestorePlan(view, served);
    } catch (error) {
      io.stderr(
        `${error instanceof Error ? error.message : 'The recovery archive could not be restored.'}\n`,
      );
      return 1;
    }

    let record: StoredEnrollment;
    try {
      record = buildRestoredEnrollmentRecord(plan, Date.now());
    } catch (error) {
      io.stderr(
        `${error instanceof Error ? error.message : 'This recovery archive could not be restored.'}\n`,
      );
      return 1;
    } finally {
      zeroizeRestorePlan(plan);
    }

    const vaultAccount: VaultAccount = { nodeOrigin: target, userId: session.userId };
    const vault = await createRatchetSessionVault({
      account: vaultAccount,
      allowInsecureKeyFile: isAllowInsecureCredentialFile(rest, env),
    });
    try {
      await vault.open();
      await saveStoredEnrollment(vault, record);
    } finally {
      vault.close();
    }

    io.stdout(
      'Recovery archive restored. Open the TUI, go to Accounts → Devices, and press "e" ' +
        'to finish enrolling this device.\n',
    );
    return 0;
  } catch (error) {
    reportAuthError(io, error, target);
    return 1;
  } finally {
    api.close();
  }
}

export async function runE2ee(rest: readonly string[], deps: E2eeRecoveryDeps): Promise<number> {
  const [subcommand, ...remaining] = rest;
  if (subcommand === '-h' || subcommand === '--help' || subcommand === undefined) {
    deps.io.stdout(
      'Usage: patches e2ee <export-recovery|import-recovery> [options]\n\n' +
        `${EXPORT_USAGE}\n${IMPORT_USAGE}`,
    );
    return subcommand === undefined ? 1 : 0;
  }
  if (subcommand === 'export-recovery') return runE2eeExportRecovery(remaining, deps);
  if (subcommand === 'import-recovery') return runE2eeImportRecovery(remaining, deps);
  deps.io.stderr(`Unknown e2ee subcommand: ${subcommand}\n`);
  return 1;
}

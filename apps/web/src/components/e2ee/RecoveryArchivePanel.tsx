/**
 * The optional recovery archive, browser side (issue #272, ADR 0020 §10, ADR 0037 §2).
 * Mirrors `apps/tui/src/cli/e2ee-recovery.ts`'s export/import orchestration: export seals
 * this device's root + roster under a freshly generated recovery key and shows the code
 * exactly once; import opens an archive, validates it against the node's served roster,
 * and turns the restore plan into a fresh, unsubmitted `StoredEnrollment` — the next
 * ordinary enrollment run (`enrollThisDevice`'s resume path) is what actually submits it.
 *
 * Never renders the root private key or raw archive bytes anywhere (spec §194) — only the
 * checksummed recovery code (itself unrelated to the root key material) is ever shown.
 */
import { useState, type JSX } from 'react';

import { verifyMessagingRoot } from '@patches/crypto';
import {
  decodeRecoveryCode,
  encodeRecoveryCode,
  groupRecoveryCodeForDisplay,
  E2eeContractError,
  type E2eeRecoveryArchiveDocument,
  type E2eeRecoveryRestorePlan,
} from '@patches/domain';

import {
  generateEnrollment,
  loadStoredEnrollment,
  saveStoredEnrollment,
  type EnrollmentTransport,
  type StoredEnrollment,
} from '../../e2ee/enrollment.js';
import {
  buildRestorePlan,
  generateRecoveryKey,
  openRecoveryArchive,
  sealRecoveryArchive,
  zeroizeRestorePlan,
  RecoveryArchiveError,
} from '../../e2ee/recovery-archive.js';
import type { RatchetSessionVault } from '../../e2ee/vault.js';

export const RECOVERY_CODE_WARNING_COPY =
  'Write this down. Without it and without an enrolled device, your encrypted history ' +
  'cannot be recovered. Patches cannot reset it.';

export const NOT_AUTHORITY_EXPORT_COPY = 'This device does not hold the messaging identity root.';

export const NO_ENROLLMENT_EXPORT_COPY =
  'This browser has no enrolled encrypted-messaging identity to export yet.';

export const ROTATED_ROOT_IMPORT_REFUSAL_COPY =
  'This recovery archive holds a messaging identity that has since rotated (generation > 1), ' +
  'which this version cannot restore — enroll from a device that already links the current ' +
  'identity instead.';

export const IMPORT_OPEN_FAILED_COPY =
  'The recovery archive could not be opened. Check the file and the code.';

export const IMPORT_WRONG_ACCOUNT_COPY =
  'This recovery archive belongs to a different account than the one signed in here.';

export const IMPORT_SUCCESS_COPY =
  'Recovery archive imported. Finish enrolling this device from the messaging screen to complete it.';

const DEFAULT_EXPORT_FILENAME = 'patches-recovery-archive.pvearc';

/** Builds the archive document from a submitted, authority-holding enrollment — never
 * conversations, history, or settings (#272's scope is root + roster only). */
function buildExportDocument(
  actorId: string,
  enrollment: StoredEnrollment,
  nowMs: number,
): E2eeRecoveryArchiveDocument {
  const root = enrollment.identity.ownRoster.root;
  if (enrollment.rootPrivate === undefined) {
    throw new RecoveryArchiveError(NOT_AUTHORITY_EXPORT_COPY);
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

/** Turns a validated restore plan into a fresh, unsubmitted `StoredEnrollment` — a brand
 * new device keypair/certificate/prekeys certified by the archive's root, never a
 * resurrection of old device or ratchet state (that never crosses this module). */
function buildRestoredEnrollmentRecord(
  plan: E2eeRecoveryRestorePlan,
  nowMs: number,
): StoredEnrollment {
  const verifiedRoot = verifyMessagingRoot({
    rootBytes: plan.rootBytes,
    selfSignature: plan.rootSelfSignature,
    nowMs,
  });
  if (verifiedRoot.generation !== 1) {
    throw new RecoveryArchiveError(ROTATED_ROOT_IMPORT_REFUSAL_COPY);
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

function downloadArchive(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface RecoveryArchivePanelProps {
  readonly actorId: string;
  readonly vault: RatchetSessionVault;
  readonly transport: EnrollmentTransport;
}

type ExportState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'error'; readonly copy: string }
  | { readonly kind: 'shown'; readonly code: string };

type ImportState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'error'; readonly copy: string }
  | { readonly kind: 'success' };

export function RecoveryArchivePanel(props: RecoveryArchivePanelProps): JSX.Element {
  const { actorId, vault, transport } = props;
  const [exportState, setExportState] = useState<ExportState>({ kind: 'idle' });
  const [exporting, setExporting] = useState(false);
  const [importFile, setImportFile] = useState<File | undefined>(undefined);
  const [importCode, setImportCode] = useState('');
  const [importState, setImportState] = useState<ImportState>({ kind: 'idle' });
  const [importing, setImporting] = useState(false);

  async function handleExport(): Promise<void> {
    setExporting(true);
    setExportState({ kind: 'idle' });
    try {
      const nowMs = Date.now();
      const enrollment = await loadStoredEnrollment(vault, nowMs);
      if (enrollment === undefined || !enrollment.submitted) {
        setExportState({ kind: 'error', copy: NO_ENROLLMENT_EXPORT_COPY });
        return;
      }
      const document = buildExportDocument(actorId, enrollment, nowMs);
      const recoveryKey = generateRecoveryKey();
      const { archive } = sealRecoveryArchive(document, recoveryKey);
      downloadArchive(archive, DEFAULT_EXPORT_FILENAME);
      const code = groupRecoveryCodeForDisplay(encodeRecoveryCode(recoveryKey));
      setExportState({ kind: 'shown', code });
    } catch (error) {
      setExportState({
        kind: 'error',
        copy: error instanceof Error ? error.message : NOT_AUTHORITY_EXPORT_COPY,
      });
    } finally {
      setExporting(false);
    }
  }

  async function handleImport(): Promise<void> {
    if (importFile === undefined) return;
    setImporting(true);
    setImportState({ kind: 'idle' });
    let recoveryKey: Uint8Array;
    try {
      recoveryKey = decodeRecoveryCode(importCode);
    } catch (error) {
      setImportState({
        kind: 'error',
        copy: error instanceof E2eeContractError ? error.message : 'That is not a recovery code.',
      });
      setImporting(false);
      return;
    }
    try {
      const archiveBytes = new Uint8Array(await importFile.arrayBuffer());
      const view = openRecoveryArchive(archiveBytes, recoveryKey);
      if (view.actorId !== actorId) {
        setImportState({ kind: 'error', copy: IMPORT_WRONG_ACCOUNT_COPY });
        return;
      }
      const rosterResponse = await transport.getDeviceRoster(actorId);
      const served =
        rosterResponse.roster === undefined
          ? { sequence: 0n, digest: new Uint8Array(32) }
          : { sequence: rosterResponse.roster.sequence, digest: rosterResponse.roster.digest };
      const plan = buildRestorePlan(view, served);
      let record: StoredEnrollment;
      try {
        record = buildRestoredEnrollmentRecord(plan, Date.now());
      } finally {
        zeroizeRestorePlan(plan);
      }
      await saveStoredEnrollment(vault, record);
      setImportCode('');
      setImportFile(undefined);
      setImportState({ kind: 'success' });
    } catch (error) {
      setImportState({
        kind: 'error',
        copy: error instanceof Error ? error.message : IMPORT_OPEN_FAILED_COPY,
      });
    } finally {
      setImporting(false);
    }
  }

  return (
    <section aria-label="Recovery archive">
      <h2>Recovery archive</h2>
      <p>
        An optional, offline backup of this account&apos;s messaging identity — export it from a
        device that already holds the identity root, and import it later on a device that lost every
        enrolled device.
      </p>

      <h3>Export</h3>
      {exportState.kind === 'error' ? <p role="alert">{exportState.copy}</p> : null}
      {exportState.kind === 'shown' ? (
        <div role="alert">
          <p>{RECOVERY_CODE_WARNING_COPY}</p>
          <p style={{ fontFamily: 'monospace', fontSize: '1.1rem' }}>{exportState.code}</p>
        </div>
      ) : null}
      <button type="button" onClick={() => void handleExport()} disabled={exporting}>
        {exporting ? 'Exporting…' : 'Export recovery archive'}
      </button>

      <h3>Import</h3>
      {importState.kind === 'error' ? <p role="alert">{importState.copy}</p> : null}
      {importState.kind === 'success' ? <p role="status">{IMPORT_SUCCESS_COPY}</p> : null}
      <div>
        <label htmlFor="recovery-archive-file">Recovery archive file</label>
        <input
          id="recovery-archive-file"
          type="file"
          onChange={(e) => setImportFile(e.target.files?.[0])}
        />
      </div>
      <div>
        <label htmlFor="recovery-archive-code">Recovery code</label>
        <input
          id="recovery-archive-code"
          value={importCode}
          onChange={(e) => setImportCode(e.target.value)}
        />
      </div>
      <button
        type="button"
        onClick={() => void handleImport()}
        disabled={importing || importFile === undefined || importCode.trim() === ''}
      >
        {importing ? 'Importing…' : 'Import recovery archive'}
      </button>
    </section>
  );
}

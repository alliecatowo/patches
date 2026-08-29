import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { encodeRecoveryCode, groupRecoveryCodeForDisplay } from '@patches/domain';

import { enrollThisDevice, loadStoredEnrollment } from '../../e2ee/enrollment.js';
import { generateRecoveryKey, sealRecoveryArchive } from '../../e2ee/recovery-archive.js';
import { createFakeE2eeNode, fakeTransport, memoryVault } from '../../e2ee/test-support.js';
import {
  IMPORT_SUCCESS_COPY,
  RECOVERY_CODE_WARNING_COPY,
  RecoveryArchivePanel,
} from './RecoveryArchivePanel.js';

const ACTOR_ID = 'actor-recovery-panel';

describe('RecoveryArchivePanel', () => {
  it('export shows the recovery code exactly once with the fixed warning copy', async () => {
    const node = createFakeE2eeNode();
    const transport = fakeTransport({ actorId: ACTOR_ID, node });
    const vault = memoryVault();
    await enrollThisDevice({ actorId: ACTOR_ID, transport, vault, nowMs: Date.now });

    render(<RecoveryArchivePanel actorId={ACTOR_ID} vault={vault} transport={transport} />);

    fireEvent.click(screen.getByRole('button', { name: 'Export recovery archive' }));

    expect(await screen.findByText(RECOVERY_CODE_WARNING_COPY)).toBeInTheDocument();
    // Exactly one export outcome is rendered at a time — never shown twice on screen.
    expect(screen.getAllByText(RECOVERY_CODE_WARNING_COPY)).toHaveLength(1);
  });

  it('import calls the recovery-archive seam and writes a fresh unsubmitted enrollment record', async () => {
    const node = createFakeE2eeNode();

    // Build a real sealed archive the same way an authority device's export would, using
    // the frozen `recovery-archive.ts` primitives directly (never a mock of them).
    const bootstrapTransport = fakeTransport({ actorId: ACTOR_ID, node });
    const bootstrapVault = memoryVault();
    const bootstrapOutcome = await enrollThisDevice({
      actorId: ACTOR_ID,
      transport: bootstrapTransport,
      vault: bootstrapVault,
      nowMs: Date.now,
    });
    if (bootstrapOutcome.status !== 'enrolled') throw new Error('bootstrap failed');
    const enrollment = await loadStoredEnrollment(bootstrapVault, Date.now());
    if (enrollment === undefined || enrollment.rootPrivate === undefined) {
      throw new Error('no stored root-holding enrollment');
    }
    const root = enrollment.identity.ownRoster.root;
    const recoveryKey = generateRecoveryKey();
    const { archive } = sealRecoveryArchive(
      {
        actorId: ACTOR_ID,
        rootGeneration: root.generation,
        rootPrivateKey: enrollment.rootPrivate,
        rootPublicKey: enrollment.rootPublic,
        rootBytes: root.rootBytes,
        rootSelfSignature: root.selfSignature,
        rosterBytes: enrollment.identity.ownRoster.rosterBytes,
        rosterSignature: enrollment.identity.ownRoster.rootSignature,
        rosterSequence: BigInt(enrollment.identity.ownRoster.sequence),
        rosterDigest: enrollment.identity.ownRoster.rosterDigest,
        createdAtMs: Date.now(),
        conversations: [],
        history: [],
        settings: undefined,
      },
      recoveryKey,
    );
    const code = groupRecoveryCodeForDisplay(encodeRecoveryCode(recoveryKey));

    // A fresh device that has never enrolled — the target of the import.
    const importTransport = fakeTransport({ actorId: ACTOR_ID, node });
    const importVault = memoryVault();

    render(
      <RecoveryArchivePanel actorId={ACTOR_ID} vault={importVault} transport={importTransport} />,
    );

    const file = new File([new Uint8Array(archive)], 'archive.pvearc', {
      type: 'application/octet-stream',
    });
    const fileInput = screen.getByLabelText('Recovery archive file');
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText('Recovery code'), { target: { value: code } });
    fireEvent.click(screen.getByRole('button', { name: 'Import recovery archive' }));

    expect(await screen.findByText(IMPORT_SUCCESS_COPY)).toBeInTheDocument();
    const restored = await loadStoredEnrollment(importVault, Date.now());
    expect(restored).toBeDefined();
    expect(restored?.submitted).toBe(false);
    expect(restored?.rootPrivate).toBeDefined();
  });
});

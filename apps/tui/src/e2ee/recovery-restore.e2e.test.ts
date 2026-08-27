/**
 * End-to-end recovery archive restore (issue #272, ADR 0020 §10): bootstrap-enroll a
 * device against a fake node → export a recovery archive → simulate losing the vault →
 * import it → run `enrollThisDevice` again. Asserts a NEW device certificate/id, the
 * SAME root public key, and — via a vault double that throws on every ratchet-session
 * method — that nothing in this path ever touches session state (ADR 0020 §10: restore
 * is a fresh enrollment, never a resurrection).
 */
import { create } from '@bufbuild/protobuf';
import {
  E2eeIdentityRootSchema,
  type E2eeIdentityRoot,
  type EnrollDeviceRequest,
  type PublishIdentityRootRequest,
} from '@patches/proto/es';
import { E2EE_PROTOCOL_V1 } from '@patches/domain';
import type { DoubleRatchetState } from '@patches/crypto';
import { describe, expect, it } from 'vitest';

import { buildExportDocument, buildRestoredEnrollmentRecord } from '../cli/e2ee-recovery.js';
import {
  ENROLLMENT_RECORD_KEY,
  enrollThisDevice,
  loadStoredEnrollment,
  saveStoredEnrollment,
  type EnrollmentCapability,
  type EnrollmentTransport,
} from './enrollment.js';
import {
  buildRestorePlan,
  generateRecoveryKey,
  openRecoveryArchive,
  sealRecoveryArchive,
} from './recovery-archive.js';
import type { RatchetSessionVault } from './ratchet-vault.js';
import type { VaultOpenInfo } from './vault-store.js';

const ACTOR_ID = 'actor-restore';
const NOW_MS = 1_780_000_000_000;

const usableCapability: EnrollmentCapability = {
  state: 3,
  supportedProtocolVersions: [E2EE_PROTOCOL_V1],
};

/**
 * A vault double whose ratchet-session methods throw — the same shape the web client's
 * own enrollment tests use. Any code path in this file that touched session state (a
 * skipped key, a prekey, an old device key) would fail the test immediately rather than
 * requiring a separate assertion to notice.
 */
function memoryVault(): RatchetSessionVault & { readonly records: Map<string, Uint8Array> } {
  const records = new Map<string, Uint8Array>();
  const unused = (): never => {
    throw new Error('recovery restore must never touch ratchet session state');
  };
  return {
    records,
    open: (): Promise<VaultOpenInfo> =>
      Promise.resolve({ generation: 0, adoptedStagedSessions: [], discardedTempFiles: [] }),
    listSessions: () => Promise.resolve([...records.keys()]),
    getSession: (): Promise<DoubleRatchetState | undefined> => unused(),
    stageSend: (): Promise<void> => unused(),
    confirmSend: (): Promise<void> => unused(),
    applyUpdate: (): Promise<void> => unused(),
    deleteSession: (): Promise<void> => unused(),
    getOpaqueRecord: (key) => Promise.resolve(records.get(key)),
    putOpaqueRecord: (key, value) => {
      records.set(key, value.slice());
      return Promise.resolve();
    },
    wipe: () => {
      records.clear();
      return Promise.resolve();
    },
    close: () => undefined,
  };
}

interface FakeNodeState {
  identityRoot?: E2eeIdentityRoot;
  roster?: { readonly sequence: bigint; readonly digest: Uint8Array };
  enrollRequests: EnrollDeviceRequest[];
}

/** One fake node whose published root/roster survives a local vault loss — the whole
 * point of the archive is that the account's server-side state outlives the device. */
function fakeTransport(state: FakeNodeState): EnrollmentTransport {
  return {
    getCapability: () => Promise.resolve(usableCapability),
    getIdentityRoot: (): Promise<E2eeIdentityRoot | undefined> =>
      Promise.resolve(state.identityRoot),
    publishIdentityRoot: (request: PublishIdentityRootRequest): Promise<unknown> => {
      state.identityRoot = request.identityRoot ?? create(E2eeIdentityRootSchema);
      return Promise.resolve(undefined);
    },
    enrollDevice: (request: EnrollDeviceRequest): Promise<unknown> => {
      state.enrollRequests.push(request);
      if (request.roster !== undefined) {
        state.roster = { sequence: request.roster.sequence, digest: request.roster.digest };
      }
      return Promise.resolve(undefined);
    },
  };
}

describe('recovery archive restore end-to-end', () => {
  it('bootstrap-enrolls, exports, wipes, imports, and re-enrolls under the same root', async () => {
    const node: FakeNodeState = { enrollRequests: [] };
    const transport = fakeTransport(node);

    // 1. Bootstrap-enroll the first device.
    const firstVault = memoryVault();
    const firstOutcome = await enrollThisDevice({
      actorId: ACTOR_ID,
      transport,
      vault: firstVault,
      nowMs: () => NOW_MS,
    });
    expect(firstOutcome.status).toBe('enrolled');
    if (firstOutcome.status !== 'enrolled') return;
    const firstDeviceId = firstOutcome.identity.deviceId;
    const rootPublicKey = firstOutcome.identity.ownRoster.root.publicKey;

    // 2. Export a recovery archive from the vault that just enrolled.
    const firstRecord = await loadStoredEnrollment(firstVault, NOW_MS);
    expect(firstRecord?.submitted).toBe(true);
    if (firstRecord === undefined) return;
    const document = buildExportDocument(ACTOR_ID, firstRecord, NOW_MS + 1_000);
    const recoveryKey = generateRecoveryKey();
    const { archive } = sealRecoveryArchive(document, recoveryKey);

    // 3. Simulate losing this device's vault entirely — a fresh vault double, nothing
    // carried over from `firstVault`.
    const secondVault = memoryVault();
    expect(secondVault.records.size).toBe(0);

    // 4. Import: decode the code, open the archive, check it against what the node still
    // serves, and turn the plan into a fresh unsubmitted enrollment record.
    const opened = openRecoveryArchive(archive, recoveryKey);
    expect(node.roster).toBeDefined();
    if (node.roster === undefined) return;
    const plan = buildRestorePlan(opened, node.roster);
    const restoredRecord = buildRestoredEnrollmentRecord(plan, NOW_MS + 2_000);
    expect(restoredRecord.submitted).toBe(false);
    expect(restoredRecord.createdRoot).toBe(false);
    await saveStoredEnrollment(secondVault, restoredRecord);

    // 5. The next `enrollThisDevice` run on this vault finishes the job: it finds the
    // unsubmitted record, sees the node's published root still matches, and enrolls.
    const secondOutcome = await enrollThisDevice({
      actorId: ACTOR_ID,
      transport,
      vault: secondVault,
      nowMs: () => NOW_MS + 3_000,
    });
    expect(secondOutcome.status).toBe('enrolled');
    if (secondOutcome.status !== 'enrolled') return;

    // A NEW device certificate/id — never the old device's identity resurrected.
    expect(secondOutcome.identity.deviceId).not.toBe(firstDeviceId);
    // The SAME messaging root — this is a link/restore, not an identity rotation.
    expect([...secondOutcome.identity.ownRoster.root.publicKey]).toEqual([...rootPublicKey]);
    expect(secondOutcome.createdRoot).toBe(false);

    // Negative assertions: the restored vault holds only the opaque enrollment record —
    // no session record, skipped key, prekey, or old device key ever reached it. (Every
    // ratchet-session method on this vault double throws if called at all, so a violation
    // anywhere above would already have failed the test.)
    expect([...secondVault.records.keys()]).toEqual([ENROLLMENT_RECORD_KEY]);
  });
});

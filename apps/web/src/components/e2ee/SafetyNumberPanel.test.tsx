import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { generateSigningKeyPair, safetyNumber } from '@patches/crypto';

import {
  buildIdentityRootWire,
  buildRosterWire,
  enrollRequestFromRecord,
  enrollThisDevice,
  generateEnrollment,
} from '../../e2ee/enrollment.js';
import { loadPeerIdentityPin, savePeerIdentityPin } from '../../e2ee/vault.js';
import { createFakeE2eeNode, fakeTransport, memoryVault } from '../../e2ee/test-support.js';
import { SafetyNumberPanel } from './SafetyNumberPanel.js';

const ACTOR_A = 'actor-safety-a';
const ACTOR_B = 'actor-safety-b';

describe('SafetyNumberPanel', () => {
  it('renders the same safety number `@patches/crypto` computes for the pair, and marks it verified', async () => {
    const node = createFakeE2eeNode();
    const transportA = fakeTransport({ actorId: ACTOR_A, node });
    const vaultA = memoryVault();
    await enrollThisDevice({
      actorId: ACTOR_A,
      transport: transportA,
      vault: vaultA,
      nowMs: Date.now,
    });

    const transportB = fakeTransport({ actorId: ACTOR_B, node });
    const vaultB = memoryVault();
    await enrollThisDevice({
      actorId: ACTOR_B,
      transport: transportB,
      vault: vaultB,
      nowMs: Date.now,
    });

    const rootA = node.rootByActor.get(ACTOR_A);
    const rootB = node.rootByActor.get(ACTOR_B);
    if (rootA === undefined || rootB === undefined) throw new Error('missing enrolled roots');
    // The independently computed reference: the exact same shared-library function the
    // TUI's `SafetyNumberScreen` calls, over the same two root public keys — this is the
    // cross-client parity guarantee, since both clients call one function, never two.
    const expected = safetyNumber(ACTOR_A, rootA.publicKey, ACTOR_B, rootB.publicKey);

    render(
      <SafetyNumberPanel
        myActorId={ACTOR_A}
        targetActorId={ACTOR_B}
        targetHandle="bee"
        transport={transportA}
        vault={vaultA}
      />,
    );

    const expectedGroups = expected.match(/.{5}/gu) ?? [];
    const expectedText = `${expectedGroups.slice(0, 6).join(' ')}\n${expectedGroups.slice(6, 12).join(' ')}`;
    await screen.findByText('Not verified yet.');
    expect(document.querySelector('pre')?.textContent).toBe(expectedText);

    fireEvent.click(screen.getByRole('button', { name: 'Mark as compared' }));
    expect(await screen.findByText('Verified — you compared this number.')).toBeInTheDocument();
  });

  it('never renders a number for a chain that fails signature verification', async () => {
    const node = createFakeE2eeNode();
    const transportA = fakeTransport({ actorId: ACTOR_A, node });
    const vaultA = memoryVault();
    await enrollThisDevice({
      actorId: ACTOR_A,
      transport: transportA,
      vault: vaultA,
      nowMs: Date.now,
    });

    // The target actor has no published root/roster at all — an unverifiable chain.
    render(
      <SafetyNumberPanel
        myActorId={ACTOR_A}
        targetActorId="actor-nobody"
        targetHandle="nobody"
        transport={transportA}
        vault={vaultA}
      />,
    );

    expect(await screen.findByText(/Could not retrieve identity keys/u)).toBeInTheDocument();
  });

  it('offers an explicit, user-confirmed re-trust after an uncountersigned reset (P2-H2)', async () => {
    const node = createFakeE2eeNode();
    const transportA = fakeTransport({ actorId: ACTOR_A, node });
    const vaultA = memoryVault();
    await enrollThisDevice({
      actorId: ACTOR_A,
      transport: transportA,
      vault: vaultA,
      nowMs: Date.now,
    });
    const transportB = fakeTransport({ actorId: ACTOR_B, node });
    await enrollThisDevice({
      actorId: ACTOR_B,
      transport: transportB,
      vault: memoryVault(),
      nowMs: Date.now,
    });

    // A pinned B's first identity.
    const firstRoot = node.rootByActor.get(ACTOR_B);
    const firstRoster = node.rosterByActor.get(ACTOR_B)?.roster;
    if (firstRoot === undefined || firstRoster === undefined) throw new Error('setup');
    await savePeerIdentityPin(vaultA, ACTOR_B, {
      rootBytes: firstRoot.rootBytes,
      selfSignature: firstRoot.selfSignature,
      rosterSequence: Number(firstRoster.sequence),
      rosterDigest: firstRoster.digest,
    });

    // B loses its key and resets: a generation-2 root, self-signed only.
    const nowMs = Date.now();
    const reset = generateEnrollment({
      actorId: ACTOR_B,
      nowMs,
      root: { ...generateSigningKeyPair(), createdAtMs: nowMs - 1000, generation: 2 },
    }).record;
    node.rootByActor.set(ACTOR_B, buildIdentityRootWire(reset.identity.ownRoster.root));
    const resetCertificate = enrollRequestFromRecord(reset).certificate;
    if (resetCertificate === undefined) throw new Error('setup');
    node.rosterByActor.set(ACTOR_B, {
      roster: buildRosterWire(reset.identity.ownRoster),
      certificates: [resetCertificate],
    });

    const accepted = vi.fn();
    render(
      <SafetyNumberPanel
        myActorId={ACTOR_A}
        targetActorId={ACTOR_B}
        targetHandle="bee"
        transport={transportA}
        vault={vaultA}
        onResetAccepted={accepted}
      />,
    );

    const accept = await screen.findByRole('button', { name: 'Accept new identity' });
    // Never silent, never one click: the box must be ticked first.
    expect(accept).toBeDisabled();
    fireEvent.click(accept);
    expect(accepted).not.toHaveBeenCalled();
    expect((await loadPeerIdentityPin(vaultA, ACTOR_B))?.rootBytes).toEqual(firstRoot.rootBytes);

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Accept new identity' }));
    await waitFor(() => expect(accepted).toHaveBeenCalledWith(ACTOR_B));
    expect((await loadPeerIdentityPin(vaultA, ACTOR_B))?.rootBytes).toEqual(
      reset.identity.ownRoster.root.rootBytes,
    );
    // Once accepted the reset prompt is gone.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Accept new identity' })).not.toBeInTheDocument(),
    );
  });
});

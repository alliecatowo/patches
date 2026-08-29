import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { safetyNumber } from '@patches/crypto';

import { enrollThisDevice } from '../../e2ee/enrollment.js';
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
});

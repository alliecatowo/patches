import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { approveLinkOffer, listLinkOffers } from '../../e2ee/device-link.js';
import { enrollThisDevice } from '../../e2ee/enrollment.js';
import { createFakeE2eeNode, fakeTransport, memoryVault } from '../../e2ee/test-support.js';
import { LinkThisDevicePanel } from './LinkThisDevicePanel.js';

const ACTOR_ID = 'actor-link-panel';

/** Bootstraps an authority device on the shared fake node — mirrors
 * `device-link.test.ts`'s end-to-end setup so this component test exercises the same real
 * `beginDeviceLinkOffer`/`approveLinkOffer`/`pollLinkedEnrollment` chain, not a mock of it. */
async function bootstrapAuthority(node: ReturnType<typeof createFakeE2eeNode>): Promise<{
  transport: ReturnType<typeof fakeTransport>;
  vault: ReturnType<typeof memoryVault>;
}> {
  const transport = fakeTransport({ actorId: ACTOR_ID, node });
  const vault = memoryVault();
  const outcome = await enrollThisDevice({ actorId: ACTOR_ID, transport, vault, nowMs: Date.now });
  expect(outcome.status).toBe('enrolled');
  return { transport, vault };
}

describe('LinkThisDevicePanel', () => {
  it('shows the SAS as five 4-digit groups and transitions to enrolled once the authority approves', async () => {
    const node = createFakeE2eeNode();
    const authority = await bootstrapAuthority(node);
    const newDeviceTransport = fakeTransport({ actorId: ACTOR_ID, node });
    const newDeviceVault = memoryVault();
    const onEnrolled = vi.fn();

    render(
      <LinkThisDevicePanel
        actorId={ACTOR_ID}
        vault={newDeviceVault}
        transport={newDeviceTransport}
        onEnrolled={onEnrolled}
        onCancel={vi.fn()}
        pollIntervalMs={20}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText('Safety code')).toBeInTheDocument());
    const sasText = screen.getByLabelText('Safety code').textContent ?? '';
    const groups = sasText.trim().split(/\s+/);
    expect(groups).toHaveLength(5);
    for (const group of groups) expect(group).toMatch(/^\d{4}$/);

    const offers = await listLinkOffers({
      actorId: ACTOR_ID,
      transport: authority.transport,
      vault: authority.vault,
      nowMs: Date.now,
    });
    expect(offers).toHaveLength(1);
    await approveLinkOffer({
      actorId: ACTOR_ID,
      linkId: offers[0]!.linkId,
      transport: authority.transport,
      vault: authority.vault,
      nowMs: Date.now,
    });

    await waitFor(() => expect(onEnrolled).toHaveBeenCalled(), { timeout: 2000 });
  });

  it('shows a retry button once the offer expires and can begin a fresh one', async () => {
    const node = createFakeE2eeNode();
    await bootstrapAuthority(node);
    const transport = fakeTransport({ actorId: ACTOR_ID, node });
    const vault = memoryVault();

    vi.useFakeTimers();
    try {
      render(
        <LinkThisDevicePanel
          actorId={ACTOR_ID}
          vault={vault}
          transport={transport}
          onEnrolled={vi.fn()}
          onCancel={vi.fn()}
          pollIntervalMs={20}
        />,
      );

      await vi.waitFor(() => expect(screen.getByLabelText('Safety code')).toBeInTheDocument());

      // Past the offer's 10-minute lifetime — the next poll reads it as expired.
      vi.setSystemTime(Date.now() + 11 * 60 * 1000);
      await vi.advanceTimersByTimeAsync(100);

      await vi.waitFor(() => expect(screen.getByText('Try again')).toBeInTheDocument());
    } finally {
      vi.useRealTimers();
    }
  });
});
